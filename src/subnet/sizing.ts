// How big a subnet does a department need?
//
//   required = ceil(devices * (1 + buffer)) + 3
//
// The +3 covers the three addresses in every subnet that devices can't use:
//   1. the network address (the first one, names the subnet itself)
//   2. the broadcast address (the last one, used to talk to everyone at once)
//   3. the gateway (the router's address, which we put at the first usable address)
//
// Then we round UP to the next power of two, because subnets only come in sizes of
// 4, 8, 16, 32, 64... addresses (a /30, /29, /28, /27, /26...).

export const DEFAULT_BUFFER_PERCENT = 20;
export const OVERHEAD_ADDRESSES = 3;
/** Smallest subnet the planner can produce: a /30 (needs at least 1 device + 3 = 4). */
export const MIN_BLOCK_SIZE = 4;

/**
 * Computers can't store most decimals exactly, so a multiplication like
 * 230 * 1.1 comes out as 253.00000000000003 instead of 253. A plain Math.ceil would
 * then round that UP to 254 even though the true answer is a whole number.
 * (It's rare: about 1 in 450 device/percentage combinations are affected, and it only
 * changes the subnet size occasionally. But 230 devices at a 10% buffer is one of them:
 * the true need is 253 + 3 = 256 addresses, and the naive maths would say 257 and
 * jump to a block twice the size.)
 *
 * So we subtract a tiny amount first, which keeps values that are *meant* to be whole
 * numbers whole. 1e-9 is far smaller than any real fraction we could meet here.
 */
const FLOAT_FUZZ = 1e-9;

/** Addresses needed for a department, before rounding up to a power of two. */
export function requiredAddresses(devices: number, bufferPercent: number): number {
  const devicesWithGrowth = Math.ceil(devices * (1 + bufferPercent / 100) - FLOAT_FUZZ);
  return devicesWithGrowth + OVERHEAD_ADDRESSES;
}

/** Smallest power of two that is >= n, and at least MIN_BLOCK_SIZE. 63 -> 64, 64 -> 64, 65 -> 128. */
export function roundUpToBlockSize(n: number): number {
  let size = MIN_BLOCK_SIZE;
  while (size < n) size *= 2;
  return size;
}

/** The prefix length for a block size: 64 -> 26, 16 -> 28. */
export function prefixForBlockSize(size: number): number {
  return 32 - Math.log2(size);
}
