import { describe, it, expect } from "vitest";
import { planNetwork, planToMarkdown, planToText, planToHtml, growthAddresses, encodePlan, decodePlan } from "./index";
import type { PlanInput } from "./index";

const input: PlanInput = {
  startBlock: "192.168.0.0/16",
  bufferPercent: 20,
  departments: [{ name: "Sales", devices: 50 }, { name: "Engineering", devices: 120 }, { name: "HR", devices: 8 }],
};
const planOf = (i: PlanInput) => {
  const r = planNetwork(i);
  if (!r.ok) throw new Error("plan failed");
  return r.plan;
};

describe("the numbers in the table", () => {
  it("120 devices @20%: /24, 254 usable, 133 free (254 - 1 gateway - 120), 24 of it growth buffer", () => {
    const eng = planOf(input).subnets.find((s) => s.name === "Engineering")!;
    expect([eng.prefix, eng.usableHosts, eng.unused]).toEqual([24, 254, 133]);
    expect(growthAddresses(120, 20)).toBe(24);
    expect(eng.unused).toBe(eng.usableHosts - 1 - eng.devices);
  });
});

describe("text exports", () => {
  const plan = planOf(input);
  it("markdown has a row per department and escapes pipes", () => {
    const md = planToMarkdown(plan);
    expect(md).toContain("| Engineering | 10 | 192.168.0.0/24 | 255.255.255.0 | 192.168.0.1 |");
    expect(md.split("\n").filter((l) => l.startsWith("| ") && !l.includes("Department")).length).toBe(3);
    expect(planToMarkdown(planOf({ ...input, departments: [{ name: "A|B", devices: 5 }] }))).toContain("A\\|B");
  });
  it("plain text and html both carry the key values", () => {
    expect(planToText(plan)).toContain("Engineering (VLAN 10)\nNetwork: 192.168.0.0/24\nMask: 255.255.255.0\nGateway: 192.168.0.1");
    const html = planToHtml(planOf({ ...input, departments: [{ name: "<b>&", devices: 5 }] }));
    expect(html).toContain("&lt;b&gt;&amp;");
    expect(html).not.toContain("<b>&");
  });
});

describe("share links", () => {
  it("round-trips, including unicode names and custom VLANs", () => {
    const i: PlanInput = { startBlock: "10.0.0.0/8", bufferPercent: 12.5, departments: [{ name: "Café ☕", devices: 30, vlanId: 99 }, { name: "IT", devices: 5, vlanId: null }] };
    const code = encodePlan(i);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePlan(code)).toEqual({ ok: true, input: i });
  });
  it("rejects garbage and wrong shapes without throwing", () => {
    expect(decodePlan("%%%").ok).toBe(false);
    expect(decodePlan("").ok).toBe(false);
    expect(decodePlan(btoa('{"v":2}')).ok).toBe(false);
    expect(decodePlan(btoa('{"v":1,"s":"x","b":1,"d":[["a","5",null]]}')).ok).toBe(false);
  });
});
