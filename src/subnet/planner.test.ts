import { describe, expect, it } from "vitest";
import { planNetwork } from "./planner";
import { parseIPv4 } from "./ip";
import { requiredAddresses, roundUpToBlockSize } from "./sizing";
import type { DepartmentInput, NetworkPlan, PlanInput } from "./types";

const dept = (name: string, devices: number, vlanId?: number): DepartmentInput => ({ name, devices, vlanId });

function plan(input: PlanInput): NetworkPlan {
  const result = planNetwork(input);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(" | "));
  return result.plan;
}

describe("a worked example (checked by hand)", () => {
  // /24 block, 20% buffer:
  //   Sales 50 devices -> 60 + 3 = 63 -> 64 addresses (/26)
  //   IT    10 devices -> 12 + 3 = 15 -> 16 addresses (/28)
  //   HR     5 devices ->  6 + 3 =  9 -> 16 addresses (/28)
  const result = plan({
    startBlock: "192.168.0.0/24",
    bufferPercent: 20,
    departments: [dept("HR", 5), dept("Sales", 50), dept("IT", 10)], // entered in a different order on purpose
  });

  it("gives out the biggest block first and lists results in address order", () => {
    expect(result.subnets.map((s) => s.name)).toEqual(["Sales", "HR", "IT"]);
    // Sales (64) first, then HR and IT (both 16) in the order they were typed: HR before IT
    expect(result.subnets.map((s) => `${s.network}/${s.prefix}`)).toEqual([
      "192.168.0.0/26",
      "192.168.0.64/28",
      "192.168.0.80/28",
    ]);
  });

  it("fills in every detail for the biggest subnet", () => {
    expect(result.subnets[0]).toEqual({
      name: "Sales",
      devices: 50,
      requiredAddresses: 63,
      size: 64,
      prefix: 26,
      mask: "255.255.255.192",
      network: "192.168.0.0",
      firstUsable: "192.168.0.1",
      lastUsable: "192.168.0.62",
      gateway: "192.168.0.1",
      broadcast: "192.168.0.63",
      usableHosts: 62,
      unused: 11, // 62 usable - 1 gateway - 50 devices
      vlanId: 10,
      entryIndex: 1,
    });
  });

  it("works out unused addresses for the others", () => {
    expect(result.subnets[1]).toMatchObject({ name: "HR", usableHosts: 14, unused: 8, broadcast: "192.168.0.79" });
    expect(result.subnets[2]).toMatchObject({ name: "IT", usableHosts: 14, unused: 3, firstUsable: "192.168.0.81" });
  });

  it("suggests VLANs 10, 20, 30 in address order", () => {
    expect(result.subnets.map((s) => s.vlanId)).toEqual([10, 20, 30]);
  });

  it("summarises used and free space, with the free space as CIDR blocks", () => {
    expect(result.summary).toEqual({
      blockSize: 256,
      allocatedAddresses: 96,
      overheadAddresses: 9,
      deviceCount: 65,
      unusedInsideSubnets: 22, // 11 + 8 + 3
      freeAddresses: 160,
      freeBlocks: [
        { network: "192.168.0.96", prefix: 27, size: 32 },
        { network: "192.168.0.128", prefix: 25, size: 128 },
      ],
    });
    expect(result.startBlock).toEqual({ network: "192.168.0.0", prefix: 24, mask: "255.255.255.0", size: 256 });
  });

  it("adds up: devices + overhead + unused = allocated", () => {
    const s = result.summary;
    expect(s.deviceCount + s.overheadAddresses + s.unusedInsideSubnets).toBe(s.allocatedAddresses);
  });
});

describe("tie-breaking", () => {
  it("keeps entry order for equal-sized subnets", () => {
    const result = plan({
      startBlock: "10.0.0.0/24",
      departments: [dept("Zebra", 10), dept("Apple", 10), dept("Mango", 10)],
    });
    expect(result.subnets.map((s) => s.name)).toEqual(["Zebra", "Apple", "Mango"]);
  });
});

describe("exact fit and overflow", () => {
  it("fills a block exactly and leaves no free space", () => {
    // 0% buffer: 125 devices + 3 = 128 each, two of them = 256
    const result = plan({
      startBlock: "192.168.0.0/24",
      bufferPercent: 0,
      departments: [dept("A", 125), dept("B", 125)],
    });
    expect(result.subnets.map((s) => `${s.network}/${s.prefix}`)).toEqual(["192.168.0.0/25", "192.168.0.128/25"]);
    expect(result.summary.freeAddresses).toBe(0);
    expect(result.summary.freeBlocks).toEqual([]);
  });

  it("fails with the right shortfall when one more small subnet is added", () => {
    const result = planNetwork({
      startBlock: "192.168.0.0/24",
      bufferPercent: 0,
      departments: [dept("A", 125), dept("B", 125), dept("C", 1)], // 128 + 128 + 4 = 260
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fit).toEqual({ totalRequired: 260, blockSize: 256, shortfall: 4 });
      expect(result.errors[0].message).toMatch(/short by 4 addresses/);
    }
  });

  it("compares the ROUNDED block sizes, not the raw required numbers", () => {
    // Each department needs 65 + 3 = 68 raw, which is 204 in total: that looks like it fits in 256.
    // But each really takes a 128 block, so the true total is 384 and we're 128 short.
    const result = planNetwork({
      startBlock: "192.168.0.0/24",
      bufferPercent: 0,
      departments: [dept("A", 65), dept("B", 65), dept("C", 65)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fit).toEqual({ totalRequired: 384, blockSize: 256, shortfall: 128 });
  });

  it("fails cleanly when a single department is bigger than the whole block", () => {
    const result = planNetwork({ startBlock: "192.168.1.0/24", departments: [dept("Huge", 1000)] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fit?.shortfall).toBeGreaterThan(0);
  });

  it("can use the smallest allowed block, a /29", () => {
    const result = plan({ startBlock: "192.168.1.0/29", bufferPercent: 0, departments: [dept("Tiny", 5)] }); // 5+3=8
    expect(result.subnets[0]).toMatchObject({ prefix: 29, usableHosts: 6, unused: 0 });
    expect(result.summary.freeAddresses).toBe(0);
  });
});

describe("small subnets", () => {
  it("gives a /29 for a single device at the default buffer", () => {
    const result = plan({ startBlock: "10.0.0.0/24", departments: [dept("Solo", 1)] });
    expect(result.subnets[0]).toMatchObject({ prefix: 29, size: 8, requiredAddresses: 5 });
  });

  it("gives a /30 for a single device with no buffer", () => {
    const result = plan({ startBlock: "10.0.0.0/24", bufferPercent: 0, departments: [dept("Solo", 1)] });
    expect(result.subnets[0]).toMatchObject({
      prefix: 30,
      size: 4,
      network: "10.0.0.0",
      gateway: "10.0.0.1",
      firstUsable: "10.0.0.1",
      lastUsable: "10.0.0.2",
      broadcast: "10.0.0.3",
      usableHosts: 2,
      unused: 0, // 2 usable - 1 gateway - 1 device
    });
  });
});

describe("start block handling", () => {
  it("corrects a non-network address and still plans from the network address", () => {
    const result = planNetwork({ startBlock: "192.168.5.1/16", departments: [dept("A", 10)] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.startBlock.network).toBe("192.168.0.0");
      expect(result.plan.subnets[0].network).toBe("192.168.0.0");
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("starts partway through the address space correctly (10.1.0.0/16)", () => {
    const result = plan({ startBlock: "10.1.0.0/16", departments: [dept("A", 300), dept("B", 10)] });
    expect(result.subnets[0].network).toBe("10.1.0.0"); // 300*1.2=360+3=363 -> 512 (/23)
    expect(result.subnets[0].prefix).toBe(23);
    expect(result.subnets[1].network).toBe("10.1.2.0");
  });

  it("passes validation errors straight through", () => {
    const result = planNetwork({ startBlock: "bad", departments: [dept("", 0)] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("VLAN assignment", () => {
  it("keeps VLANs the user typed and suggests the rest", () => {
    const result = plan({
      startBlock: "10.0.0.0/16",
      departments: [dept("Big", 200), dept("Mid", 50, 99), dept("Small", 5)],
    });
    // address order: Big, Mid, Small
    expect(result.subnets.map((s) => s.vlanId)).toEqual([10, 99, 30]);
  });

  it("never suggests an ID that a later department has typed in", () => {
    const result = plan({
      startBlock: "10.0.0.0/16",
      departments: [dept("Big", 200), dept("Mid", 50), dept("Small", 5, 10)],
    });
    // Big would normally get 10 but Small has taken it, so Big moves to 20; Mid then gets 30 or higher
    const ids = result.subnets.map((s) => s.vlanId);
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]).toBe(10);
    expect(ids[0]).toBe(20);
  });
});

describe("invariants hold for lots of random plans", () => {
  // A tiny seeded random number generator so the "random" tests are the same every run.
  function makeRandom(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("never overlaps, always aligns, always accounts for every address", () => {
    const random = makeRandom(12345);
    const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    let fitted = 0;
    let overflowed = 0;

    for (let run = 0; run < 400; run++) {
      const prefix = between(16, 24);
      const buffer = between(0, 60);
      const departments = Array.from({ length: between(1, 14) }, (_, i) => dept(`D${i}`, between(1, 400)));
      const input: PlanInput = { startBlock: `10.${between(0, 255)}.0.0/${prefix}`, bufferPercent: buffer, departments };
      const result = planNetwork(input);
      const blockSize = 2 ** (32 - prefix);

      if (!result.ok) {
        // The only way a valid input can fail is "doesn't fit", and then the maths must agree
        const total = departments.reduce((sum, d) => sum + roundUpToBlockSize(requiredAddresses(d.devices, buffer)), 0);
        expect(result.fit?.shortfall).toBe(total - blockSize);
        expect(total).toBeGreaterThan(blockSize);
        overflowed++;
        continue;
      }
      fitted++;

      const { plan: p } = result;
      const start = parseIPv4(p.startBlock.network)!;
      let previousEnd = start; // first address not yet used

      for (const s of p.subnets) {
        const network = parseIPv4(s.network)!;
        expect(network % s.size).toBe(0); // aligned
        expect(network).toBeGreaterThanOrEqual(previousEnd); // no overlap, address order
        expect(network + s.size).toBeLessThanOrEqual(start + blockSize); // inside the block
        previousEnd = network + s.size;

        expect(s.size).toBeGreaterThanOrEqual(s.requiredAddresses); // big enough
        expect(s.size / 2).toBeLessThan(s.requiredAddresses); // and the smallest that is
        expect(s.unused).toBeGreaterThanOrEqual(0);
        expect(s.devices + 1 + s.unused).toBe(s.usableHosts);
        expect(s.usableHosts).toBe(s.size - 2);
      }

      // Every address is either allocated or free
      expect(p.summary.allocatedAddresses + p.summary.freeAddresses).toBe(blockSize);
      expect(p.summary.freeBlocks.reduce((sum, b) => sum + b.size, 0)).toBe(p.summary.freeAddresses);
      expect(p.summary.deviceCount + p.summary.overheadAddresses + p.summary.unusedInsideSubnets).toBe(
        p.summary.allocatedAddresses,
      );

      // Free blocks begin right after the last subnet, are aligned, and don't overlap each other
      let expectedFree = previousEnd;
      for (const block of p.summary.freeBlocks) {
        const network = parseIPv4(block.network)!;
        expect(network).toBe(expectedFree);
        expect(network % block.size).toBe(0);
        expectedFree += block.size;
      }

      // VLAN IDs are unique and in range
      const vlans = p.subnets.map((s) => s.vlanId);
      expect(new Set(vlans).size).toBe(vlans.length);
      for (const v of vlans) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(4094);
      }

      // Every department made it into the plan exactly once
      expect(p.subnets.map((s) => s.name).sort()).toEqual(departments.map((d) => d.name).sort());
    }

    // Make sure the random test actually exercised both outcomes
    expect(fitted).toBeGreaterThan(50);
    expect(overflowed).toBeGreaterThan(5);
  });
});
