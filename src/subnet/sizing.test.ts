import { describe, expect, it } from "vitest";
import { prefixForBlockSize, requiredAddresses, roundUpToBlockSize } from "./sizing";

describe("requiredAddresses", () => {
  it("adds the growth buffer then the 3 overhead addresses", () => {
    expect(requiredAddresses(50, 20)).toBe(63); // 60 + 3
    expect(requiredAddresses(100, 0)).toBe(103);
    expect(requiredAddresses(10, 100)).toBe(23); // 20 + 3
  });

  it("rounds the buffered device count UP", () => {
    expect(requiredAddresses(7, 20)).toBe(12); // 8.4 -> 9, + 3
    expect(requiredAddresses(1, 20)).toBe(5); // 1.2 -> 2, + 3
  });

  it("isn't thrown off by floating point error", () => {
    // In plain JS, 230 * 1.1 = 253.00000000000003, so Math.ceil gives 254 instead of 253.
    // That would turn an exact 256-address need into 257 and force a block twice as big.
    expect(230 * (1 + 10 / 100)).toBeGreaterThan(253); // proves the float error is real
    expect(requiredAddresses(230, 10)).toBe(256);
    expect(roundUpToBlockSize(requiredAddresses(230, 10))).toBe(256);

    // Genuine fractions must still round up: 3 * 1.1 = 3.3 -> 4
    expect(requiredAddresses(3, 10)).toBe(7);

    // Compare against exact whole-number maths for lots of combinations
    for (let devices = 1; devices <= 3000; devices++) {
      for (let pct = 0; pct <= 100; pct++) {
        const exact = Math.ceil((devices * (100 + pct)) / 100); // whole numbers only: no float error
        expect(requiredAddresses(devices, pct)).toBe(exact + 3);
      }
    }
  });
});

describe("roundUpToBlockSize", () => {
  it("rounds up to the next power of two", () => {
    expect(roundUpToBlockSize(63)).toBe(64);
    expect(roundUpToBlockSize(65)).toBe(128);
    expect(roundUpToBlockSize(9)).toBe(16);
  });

  it("leaves exact powers of two alone (exact fit)", () => {
    expect(roundUpToBlockSize(64)).toBe(64);
    expect(roundUpToBlockSize(8)).toBe(8);
    expect(roundUpToBlockSize(256)).toBe(256);
  });

  it("never goes below 4 (a /30)", () => {
    expect(roundUpToBlockSize(1)).toBe(4);
    expect(roundUpToBlockSize(4)).toBe(4);
    expect(roundUpToBlockSize(5)).toBe(8);
  });
});

describe("prefixForBlockSize", () => {
  it("maps sizes to prefixes", () => {
    expect(prefixForBlockSize(4)).toBe(30);
    expect(prefixForBlockSize(8)).toBe(29);
    expect(prefixForBlockSize(64)).toBe(26);
    expect(prefixForBlockSize(256)).toBe(24);
    expect(prefixForBlockSize(2 ** 24)).toBe(8);
  });
});

describe("smallest subnet the planner can produce", () => {
  it("is a /29 with the default 20% buffer, and a /30 only with a 0% buffer", () => {
    expect(prefixForBlockSize(roundUpToBlockSize(requiredAddresses(1, 20)))).toBe(29);
    expect(prefixForBlockSize(roundUpToBlockSize(requiredAddresses(1, 0)))).toBe(30);
  });
});
