import { describe, it, expect } from "vitest";
import { requiredAddresses } from "./sizing";

// Checks the float-based sizing against exact whole-number maths for every device count
// from 1 to 2000 and every buffer from 0% to 100% in 0.1% steps (2 million combinations).
describe("sizing is exact (no rounding errors)", () => {
  it("matches integer maths everywhere", () => {
    const wrong: string[] = [];
    for (let devices = 1; devices <= 2000; devices++) {
      for (let tenths = 0; tenths <= 1000; tenths++) {
        const exact = Math.floor((devices * (1000 + tenths) + 999) / 1000) + 3;
        if (requiredAddresses(devices, tenths / 10) !== exact) wrong.push(`${devices} @ ${tenths / 10}%`);
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });
});
