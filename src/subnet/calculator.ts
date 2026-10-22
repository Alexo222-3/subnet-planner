// The standalone subnet calculator: give it an IP and a prefix/mask, get every detail back.

import {
  blockSizeForPrefix,
  formatIPv4,
  maskToPrefix,
  networkAddressOf,
  parseIPv4,
  parsePrefixLength,
  prefixToMask,
  prefixToWildcard,
} from "./ip";
import type { SubnetDetails } from "./types";

/**
 * Work out all the details of a subnet from a number address and prefix.
 * (The planner uses this too, so the calculator and the plan always agree.)
 *
 * Special cases:
 *  - /31: a point-to-point link (RFC 3021). Both addresses are usable, no broadcast.
 *  - /32: a single host. One address, usable, no broadcast.
 *  - everything else: first address = network, last = broadcast, the rest are usable.
 */
export function describeSubnet(address: number, prefix: number): SubnetDetails {
  const size = blockSizeForPrefix(prefix);
  const network = networkAddressOf(address, prefix);
  const last = network + size - 1;

  const common = {
    prefix,
    mask: formatIPv4(prefixToMask(prefix)),
    wildcard: formatIPv4(prefixToWildcard(prefix)),
    network: formatIPv4(network),
    totalAddresses: size,
  };

  if (prefix === 32) {
    return {
      ...common,
      broadcast: null,
      firstUsable: common.network,
      lastUsable: common.network,
      usableHosts: 1,
      kind: "single-host",
    };
  }

  if (prefix === 31) {
    return {
      ...common,
      broadcast: null,
      firstUsable: formatIPv4(network),
      lastUsable: formatIPv4(last),
      usableHosts: 2,
      kind: "point-to-point",
    };
  }

  return {
    ...common,
    broadcast: formatIPv4(last),
    firstUsable: formatIPv4(network + 1),
    lastUsable: formatIPv4(last - 1),
    usableHosts: size - 2,
    kind: "normal",
  };
}

export type CalculatorResult =
  | { ok: true; details: SubnetDetails }
  | { ok: false; error: string };

/**
 * The calculator tab's entry point.
 * `prefixOrMask` can be a number (24), "24", "/24" or a mask like "255.255.255.0".
 * The IP doesn't have to be the network address: 192.168.1.77 /26 is fine and gives
 * the details of the subnet that address belongs to.
 */
export function calculateSubnet(ipText: string, prefixOrMask: string | number): CalculatorResult {
  const address = parseIPv4(ipText);
  if (address === null) {
    return {
      ok: false,
      error: `"${ipText.trim()}" isn't a valid IPv4 address. Use four numbers from 0 to 255, like 192.168.1.10.`,
    };
  }

  let prefix: number | null;
  const text = String(prefixOrMask).trim();

  if (text.includes(".")) {
    // Looks like a dotted mask
    prefix = maskToPrefix(text);
    if (prefix === null) {
      return {
        ok: false,
        error: `"${text}" isn't a valid subnet mask. A mask is a run of 1s followed by 0s, like 255.255.255.0.`,
      };
    }
  } else {
    prefix = parsePrefixLength(text);
    if (prefix === null) {
      return {
        ok: false,
        error: `"${text}" isn't a valid prefix length. Use a whole number from 0 to 32, like /24.`,
      };
    }
  }

  return { ok: true, details: describeSubnet(address, prefix) };
}
