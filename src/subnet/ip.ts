// Low-level IPv4 helpers.
//
// An IPv4 address is really just a 32-bit number. 192.168.1.10 is
// 192*256^3 + 168*256^2 + 1*256 + 10 = 3232235786. Working with plain numbers makes the
// subnet maths simple: "the next subnet starts at address + size".
//
// We use normal arithmetic (+, -, %, **) instead of bit-shifting, because JavaScript's
// bitwise operators work on SIGNED 32-bit numbers and quietly give negative results for
// addresses above 127.255.255.255. Normal arithmetic on JavaScript numbers is exact for
// anything up to 2^53, so it's safe here.

export const ADDRESS_SPACE = 2 ** 32;

/** Turn "192.168.1.10" into a number. Returns null if it isn't a valid IPv4 address. */
export function parseIPv4(text: string): number | null {
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null; // digits only, no signs or spaces
    if (part.length > 1 && part.startsWith("0")) return null; // "010" is ambiguous (octal?), so reject
    const octet = Number(part);
    if (octet > 255) return null;
    result = result * 256 + octet;
  }
  return result;
}

/** Turn a number back into dotted form: 3232235786 -> "192.168.1.10". */
export function formatIPv4(value: number): string {
  return [
    Math.floor(value / 16777216) % 256,
    Math.floor(value / 65536) % 256,
    Math.floor(value / 256) % 256,
    value % 256,
  ].join(".");
}

/** Parse "24" or "/24" into 24. Returns null unless it's a whole number from 0 to 32. */
export function parsePrefixLength(text: string): number | null {
  const cleaned = text.trim().replace(/^\//, "");
  if (!/^\d{1,2}$/.test(cleaned)) return null;
  const prefix = Number(cleaned);
  return prefix <= 32 ? prefix : null;
}

/** How many addresses a prefix covers: /24 -> 256, /30 -> 4, /32 -> 1. */
export function blockSizeForPrefix(prefix: number): number {
  return 2 ** (32 - prefix);
}

/** The subnet mask as a number: /24 -> 255.255.255.0 (4294967040). */
export function prefixToMask(prefix: number): number {
  return ADDRESS_SPACE - blockSizeForPrefix(prefix);
}

/**
 * Turn a mask like "255.255.255.0" into a prefix length (24).
 * Returns null if it isn't a real mask. A real mask is a run of 1s then a run of 0s,
 * so 255.0.255.0 is not valid. We check by comparing against all 33 possible masks.
 */
export function maskToPrefix(maskText: string): number | null {
  const value = parseIPv4(maskText);
  if (value === null) return null;
  for (let prefix = 0; prefix <= 32; prefix++) {
    if (prefixToMask(prefix) === value) return prefix;
  }
  return null;
}

/** The wildcard mask is the mask flipped: 255.255.255.0 -> 0.0.0.255 (used in Cisco ACLs). */
export function prefixToWildcard(prefix: number): number {
  return ADDRESS_SPACE - 1 - prefixToMask(prefix);
}

/** Round an address down to the start of its subnet: 192.168.5.1/16 -> 192.168.0.0. */
export function networkAddressOf(address: number, prefix: number): number {
  return address - (address % blockSizeForPrefix(prefix));
}

const PRIVATE_RANGES = [
  { start: parseIPv4("10.0.0.0")!, end: parseIPv4("10.255.255.255")! },
  { start: parseIPv4("172.16.0.0")!, end: parseIPv4("172.31.255.255")! },
  { start: parseIPv4("192.168.0.0")!, end: parseIPv4("192.168.255.255")! },
];

/** True if the WHOLE block sits inside 10.x, 172.16-31.x or 192.168.x (RFC 1918). */
export function isPrivateBlock(network: number, prefix: number): boolean {
  const last = network + blockSizeForPrefix(prefix) - 1;
  return PRIVATE_RANGES.some((range) => network >= range.start && last <= range.end);
}

export interface NumericBlock {
  start: number;
  prefix: number;
  size: number;
}

/**
 * Break a run of addresses into the fewest properly aligned CIDR blocks.
 *
 * Example: 192.168.0.96 for 160 addresses becomes 192.168.0.96/27 and 192.168.0.128/25.
 * A CIDR block of size S must start on a multiple of S, so at each step we take the
 * biggest block that (a) starts at a multiple of its own size and (b) still fits in
 * what's left.
 */
export function rangeToCidrBlocks(start: number, count: number): NumericBlock[] {
  const blocks: NumericBlock[] = [];
  let cursor = start;
  let remaining = count;

  while (remaining > 0) {
    for (let hostBits = 32; hostBits >= 0; hostBits--) {
      const size = 2 ** hostBits;
      if (size <= remaining && cursor % size === 0) {
        blocks.push({ start: cursor, prefix: 32 - hostBits, size });
        cursor += size;
        remaining -= size;
        break; // size 1 always works, so we always reach a break
      }
    }
  }
  return blocks;
}
