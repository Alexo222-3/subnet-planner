// Tests for saving/loading plans as JSON. Run with: npm test
import { describe, it, expect } from "vitest";
import { serializePlan, parseSavedPlan } from "./persistence";
import type { PlanInput } from "./types";

const input: PlanInput = {
  startBlock: "192.168.0.0/16",
  bufferPercent: 20,
  departments: [
    { name: "Sales", devices: 50, vlanId: 10 },
    { name: "Engineering", devices: 120 }, // no VLAN typed in
  ],
};

describe("serializePlan / parseSavedPlan", () => {
  it("round-trips: saving then loading gives back the same inputs", () => {
    const text = serializePlan(input, new Date("2026-10-21T12:00:00Z"));

    // The saved file carries our marker, format version and timestamp.
    const file = JSON.parse(text);
    expect(file.app).toBe("subnet-planner");
    expect(file.version).toBe(1);
    expect(file.savedAt).toBe("2026-10-21T12:00:00.000Z");

    const result = parseSavedPlan(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.startBlock).toBe("192.168.0.0/16");
      expect(result.input.bufferPercent).toBe(20);
      expect(result.input.departments).toEqual([
        { name: "Sales", devices: 50, vlanId: 10 },
        { name: "Engineering", devices: 120, vlanId: null },
      ]);
    }
  });

  it("rejects text that isn't JSON", () => {
    const result = parseSavedPlan("not json at all {");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("isn't valid JSON");
  });

  it("rejects JSON that isn't one of our save files", () => {
    for (const text of ['"hello"', "123", '{"app":"other-app"}']) {
      const result = parseSavedPlan(text);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a newer format version with a clear message", () => {
    const result = parseSavedPlan(
      JSON.stringify({ app: "subnet-planner", version: 99, input: {} }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("version 99");
  });

  it("rejects files with missing pieces", () => {
    const base = { app: "subnet-planner", version: 1, savedAt: "x" };
    const cases: [unknown, string][] = [
      [{ ...base }, "missing its inputs"],
      [{ ...base, input: { bufferPercent: 20, departments: [] } }, "missing the starting block"],
      [{ ...base, input: { startBlock: "10.0.0.0/8", departments: [] } }, "missing the growth buffer"],
      [{ ...base, input: { startBlock: "10.0.0.0/8", bufferPercent: 20 } }, "missing its department list"],
      [
        { ...base, input: { startBlock: "10.0.0.0/8", bufferPercent: 20, departments: [{ name: "A" }] } },
        "Department 1",
      ],
    ];
    for (const [file, fragment] of cases) {
      const result = parseSavedPlan(JSON.stringify(file));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(fragment);
    }
  });

  it("never throws, whatever it is fed", () => {
    for (const text of ["", "null", "[]", '{"app":"subnet-planner"}', "\u0000\u0001"]) {
      expect(() => parseSavedPlan(text)).not.toThrow();
    }
  });
});
