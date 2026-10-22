// The main planner: turns "departments + device counts + a starting block" into a
// full network plan using VLSM (variable length subnet masking).
//
// The idea of VLSM: give each department the smallest subnet that fits it, instead of
// chopping the network into equal pieces. A 5-device team shouldn't get the same size
// block as a 200-device team.
//
// How the allocation works:
//   1. Work out each department's block size (see sizing.ts).
//   2. Check it fits: add up the block sizes and compare to the starting block.
//   3. Sort largest first (ties keep the order the user typed them in).
//   4. Hand out blocks one after another from the start of the starting block.
//   5. Whatever is left at the end is free space, listed as CIDR blocks.

import { describeSubnet } from "./calculator";
import {
  blockSizeForPrefix,
  formatIPv4,
  prefixToMask,
  rangeToCidrBlocks,
} from "./ip";
import {
  OVERHEAD_ADDRESSES,
  prefixForBlockSize,
  requiredAddresses,
  roundUpToBlockSize,
} from "./sizing";
import { CISCO_RESERVED_VLANS, MAX_VLAN, validateInput } from "./validate";
import type { NetworkPlan, PlanInput, PlanResult, SubnetAllocation } from "./types";

const formatNumber = (n: number) => n.toLocaleString("en-GB");

export function planNetwork(input: PlanInput): PlanResult {
  const validation = validateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }

  const { startNetwork, startPrefix, bufferPercent, departments } = validation.value;
  const warnings = validation.warnings;
  const blockSize = blockSizeForPrefix(startPrefix);

  // ---- Step 1: size every department ----
  const sized = departments.map((dept) => {
    const required = requiredAddresses(dept.devices, bufferPercent);
    return { ...dept, required, size: roundUpToBlockSize(required) };
  });

  // ---- Step 2: does it fit? ----
  // IMPORTANT: we add up the ROUNDED block sizes (64 + 32 + 8...), not the raw "required"
  // numbers. A department needing 65 addresses really takes 128, so adding raw numbers
  // would say things fit when they don't.
  //
  // Why is this check exact? Every size is a power of two and we place the largest first.
  // The starting block is aligned to its own size, which is a multiple of every smaller
  // power of two, so each block lands neatly on its boundary with no gaps. That means the
  // plan fits if and only if the sizes add up to no more than the starting block.
  const totalRequired = sized.reduce((sum, dept) => sum + dept.size, 0);
  if (totalRequired > blockSize) {
    const shortfall = totalRequired - blockSize;
    const startText = `${formatIPv4(startNetwork)}/${startPrefix}`;
    return {
      ok: false,
      errors: [
        {
          field: "plan",
          message:
            `The departments need ${formatNumber(totalRequired)} addresses once each is rounded up to a subnet size, ` +
            `but ${startText} only has ${formatNumber(blockSize)}. You're short by ${formatNumber(shortfall)} addresses. ` +
            `Try a bigger starting block, a smaller growth buffer, or fewer devices.`,
        },
      ],
      warnings,
      fit: { totalRequired, blockSize, shortfall },
    };
  }

  // ---- Step 3: largest first, ties keep entry order ----
  const ordered = [...sized].sort((a, b) => b.size - a.size || a.entryIndex - b.entryIndex);

  // ---- Step 4: hand out blocks one after another ----
  let cursor = startNetwork;
  const placed = ordered.map((dept) => {
    // Safety net. Given the reasoning in step 2 this can't happen, but if a future change
    // breaks the maths we want a loud error rather than a silently wrong plan.
    if (cursor % dept.size !== 0) {
      throw new Error(`Internal error: ${dept.name} would start at a misaligned address.`);
    }
    const prefix = prefixForBlockSize(dept.size);
    const details = describeSubnet(cursor, prefix);
    cursor += dept.size;
    return { dept, prefix, details };
  });
  // Because we hand blocks out from low to high, `placed` is already in address order.

  // ---- VLAN IDs ----
  // Departments with a VLAN typed in keep it. The rest get 10, 20, 30... in address order,
  // skipping any number that's already taken.
  const usedVlans = new Set<number>();
  for (const { dept } of placed) if (dept.vlanId !== null) usedVlans.add(dept.vlanId);

  const vlanIds: number[] = [];
  for (let position = 0; position < placed.length; position++) {
    const manual = placed[position].dept.vlanId;
    if (manual !== null) {
      vlanIds.push(manual);
      continue;
    }
    let candidate = 10 * (position + 1);
    while (candidate <= MAX_VLAN && usedVlans.has(candidate)) candidate += 10;
    if (candidate > MAX_VLAN) {
      const fallback = firstFreeVlan(usedVlans);
      if (fallback === null) {
        return {
          ok: false,
          errors: [{ field: "vlanId", message: "There are no VLAN IDs left to suggest." }],
          warnings,
        };
      }
      candidate = fallback;
    }
    usedVlans.add(candidate);
    vlanIds.push(candidate);
  }

  // ---- Build the output rows ----
  const subnets: SubnetAllocation[] = placed.map(({ dept, prefix, details }, i) => ({
    name: dept.name,
    devices: dept.devices,
    requiredAddresses: dept.required,
    size: dept.size,
    prefix,
    mask: details.mask,
    network: details.network,
    firstUsable: details.firstUsable,
    lastUsable: details.lastUsable,
    gateway: details.firstUsable, // gateway = first usable host
    broadcast: details.broadcast as string, // always set for /30 and bigger
    usableHosts: details.usableHosts,
    // Usable addresses, minus the gateway, minus the devices. This includes the growth buffer.
    unused: details.usableHosts - 1 - dept.devices,
    vlanId: vlanIds[i],
    entryIndex: dept.entryIndex,
  }));

  // ---- Step 5: summary and free space ----
  const allocatedAddresses = totalRequired;
  const freeAddresses = blockSize - allocatedAddresses;
  const freeBlocks = rangeToCidrBlocks(cursor, freeAddresses).map((block) => ({
    network: formatIPv4(block.start),
    prefix: block.prefix,
    size: block.size,
  }));

  const plan: NetworkPlan = {
    startBlock: {
      network: formatIPv4(startNetwork),
      prefix: startPrefix,
      mask: formatIPv4(prefixToMask(startPrefix)),
      size: blockSize,
    },
    bufferPercent,
    subnets,
    summary: {
      blockSize,
      allocatedAddresses,
      overheadAddresses: OVERHEAD_ADDRESSES * subnets.length,
      deviceCount: subnets.reduce((sum, s) => sum + s.devices, 0),
      unusedInsideSubnets: subnets.reduce((sum, s) => sum + s.unused, 0),
      freeAddresses,
      freeBlocks,
    },
  };

  return { ok: true, plan, warnings };
}

/** Smallest unused VLAN ID from 2 to 4094, skipping the Cisco-reserved range. */
function firstFreeVlan(used: Set<number>): number | null {
  for (let id = 2; id <= MAX_VLAN; id++) {
    if (!used.has(id) && !CISCO_RESERVED_VLANS.includes(id)) return id;
  }
  return null;
}
