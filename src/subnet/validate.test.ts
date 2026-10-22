import { describe, expect, it } from "vitest";
import { validateInput } from "./validate";
import type { PlanInput } from "./types";

const base = (overrides: Partial<PlanInput> = {}): PlanInput => ({
  startBlock: "192.168.0.0/16",
  bufferPercent: 20,
  departments: [{ name: "Sales", devices: 10 }],
  ...overrides,
});

function errorsOf(input: PlanInput) {
  const result = validateInput(input);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("starting block", () => {
  it("accepts /8 through /29", () => {
    expect(validateInput(base({ startBlock: "10.0.0.0/8" })).ok).toBe(true);
    expect(validateInput(base({ startBlock: "192.168.1.0/29" })).ok).toBe(true);
  });

  it("rejects prefixes outside /8 to /29", () => {
    expect(errorsOf(base({ startBlock: "10.0.0.0/7" }))[0].message).toMatch(/between \/8 and \/29/);
    expect(errorsOf(base({ startBlock: "192.168.1.0/30" }))[0].message).toMatch(/between \/8 and \/29/);
    expect(errorsOf(base({ startBlock: "192.168.1.1/32" }))[0].message).toMatch(/between \/8 and \/29/);
  });

  it.each(["", "192.168.0.0", "192.168.0.0/", "192.168.0.0/abc", "999.0.0.0/16", "192.168.0.0/16/8", "/16"])(
    "rejects malformed block %j",
    (bad) => {
      const errors = errorsOf(base({ startBlock: bad }));
      expect(errors.some((e) => e.field === "startBlock")).toBe(true);
    },
  );

  it("corrects host bits and warns instead of rejecting", () => {
    const result = validateInput(base({ startBlock: "192.168.5.1/16" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startPrefix).toBe(16);
      expect(result.warnings.some((w) => w.message.includes("192.168.0.0/16"))).toBe(true);
    }
  });

  it("gives no warnings for a clean private block", () => {
    const result = validateInput(base());
    expect(result.warnings).toEqual([]);
  });

  it("warns about public ranges but still accepts them", () => {
    const result = validateInput(base({ startBlock: "8.8.8.0/24" }));
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => /private/.test(w.message))).toBe(true);
  });
});

describe("growth buffer", () => {
  it("defaults to 20 when left out", () => {
    const result = validateInput({ startBlock: "10.0.0.0/8", departments: [{ name: "A", devices: 1 }] });
    expect(result.ok && result.value.bufferPercent).toBe(20);
  });

  it("accepts 0 and 100", () => {
    expect(validateInput(base({ bufferPercent: 0 })).ok).toBe(true);
    expect(validateInput(base({ bufferPercent: 100 })).ok).toBe(true);
  });

  it.each([-1, -50, 100.5, 5000, NaN, Infinity])("rejects %s", (bad) => {
    expect(errorsOf(base({ bufferPercent: bad })).some((e) => e.field === "bufferPercent")).toBe(true);
  });
});

describe("departments", () => {
  it("needs at least one", () => {
    expect(errorsOf(base({ departments: [] })).some((e) => e.field === "departments")).toBe(true);
  });

  it("rejects empty or whitespace-only names", () => {
    const errors = errorsOf(base({ departments: [{ name: "   ", devices: 5 }] }));
    expect(errors[0]).toMatchObject({ field: "name", departmentIndex: 0 });
  });

  it("treats names as duplicates ignoring case and surrounding spaces", () => {
    const errors = errorsOf(
      base({
        departments: [
          { name: "Sales", devices: 5 },
          { name: "sales ", devices: 5 },
        ],
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "name", departmentIndex: 1 });
  });

  it("trims names it accepts", () => {
    const result = validateInput(base({ departments: [{ name: "  Sales  ", devices: 5 }] }));
    expect(result.ok && result.value.departments[0].name).toBe("Sales");
  });

  it.each([0, -3, 2.5, NaN, Infinity, 2 ** 24 + 1])("rejects %s devices", (bad) => {
    const errors = errorsOf(base({ departments: [{ name: "A", devices: bad }] }));
    expect(errors[0]).toMatchObject({ field: "devices", departmentIndex: 0 });
  });

  it("reports every problem at once", () => {
    const errors = errorsOf({
      startBlock: "nonsense",
      bufferPercent: -5,
      departments: [
        { name: "", devices: 0 },
        { name: "B", devices: 1.5 },
      ],
    });
    expect(errors.map((e) => e.field).sort()).toEqual(["bufferPercent", "devices", "devices", "name", "startBlock"]);
  });
});

describe("VLAN IDs", () => {
  const withVlans = (...vlans: Array<number | undefined>): PlanInput =>
    base({ departments: vlans.map((vlanId, i) => ({ name: `Dept${i}`, devices: 5, vlanId })) });

  it("accepts 1 to 4094 and leaves blanks as null", () => {
    const result = validateInput(withVlans(2, 4094, undefined));
    expect(result.ok && result.value.departments.map((d) => d.vlanId)).toEqual([2, 4094, null]);
  });

  it.each([0, -1, 4095, 10.5, NaN])("rejects VLAN %s", (bad) => {
    expect(errorsOf(withVlans(bad))[0]).toMatchObject({ field: "vlanId", departmentIndex: 0 });
  });

  it("rejects two departments sharing a VLAN ID", () => {
    const errors = errorsOf(withVlans(20, 30, 20));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ field: "vlanId", departmentIndex: 2 });
  });

  it("warns about VLAN 1 and 1002-1005 but allows them", () => {
    for (const id of [1, 1002, 1003, 1004, 1005]) {
      const result = validateInput(withVlans(id));
      expect(result.ok).toBe(true);
      expect(result.warnings.some((w) => w.field === "vlanId")).toBe(true);
    }
    expect(validateInput(withVlans(1001)).warnings).toEqual([]);
    expect(validateInput(withVlans(1006)).warnings).toEqual([]);
  });
});
