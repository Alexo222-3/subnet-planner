// Tests for CSV export. Run with: npm test
import { describe, it, expect } from "vitest";
import { planToCsv } from "./csv";
import type { NetworkPlan } from "./types";

/** A small fixed plan so the expected CSV is easy to read. */
const plan: NetworkPlan = {
  startBlock: { network: "192.168.0.0", prefix: 24, mask: "255.255.255.0", size: 256 },
  bufferPercent: 20,
  subnets: [
    {
      name: "Engineering",
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
      unused: 11,
      vlanId: 10,
      entryIndex: 0,
    },
  ],
  summary: {
    blockSize: 256,
    allocatedAddresses: 64,
    overheadAddresses: 3,
    deviceCount: 50,
    unusedInsideSubnets: 11,
    freeAddresses: 192,
    freeBlocks: [{ network: "192.168.0.64", prefix: 26, size: 64 }],
  },
};

describe("planToCsv", () => {
  const csv = planToCsv(plan, new Date("2026-10-21T12:00:00Z"));
  const lines = csv.trimEnd().split("\n");

  it("starts with a header block describing the plan", () => {
    expect(lines[0]).toBe("Subnet plan");
    expect(lines[1]).toBe("Generated,2026-10-21T12:00:00.000Z");
    expect(lines[2]).toBe("Starting block,192.168.0.0/24");
    expect(lines[3]).toBe("Growth buffer,20%");
  });

  it("has a column header row and one row per department", () => {
    expect(csv).toContain("Department,VLAN,Network (CIDR),Subnet mask,Gateway,First usable,Last usable,Broadcast,Devices requested,Usable hosts,Unused addresses");
    expect(csv).toContain("Engineering,10,192.168.0.0/26,255.255.255.192,192.168.0.1,192.168.0.1,192.168.0.62,192.168.0.63,50,62,11");
  });

  it("ends with the summary numbers and free blocks", () => {
    expect(csv).toContain("Still free in starting block,192");
    expect(csv).toContain("Free blocks,192.168.0.64/26");
  });

  it("quotes fields that contain commas, quotes or newlines", () => {
    const tricky: NetworkPlan = {
      ...plan,
      subnets: [{ ...plan.subnets[0], name: 'Sales, "North"\nRegion' }],
    };
    const out = planToCsv(tricky);
    // Commas and quotes inside a name must not break the columns.
    expect(out).toContain('"Sales, ""North""\nRegion",10,');
  });

  it("leaves the free-blocks line out when nothing is free", () => {
    const full: NetworkPlan = {
      ...plan,
      summary: { ...plan.summary, freeAddresses: 0, freeBlocks: [] },
    };
    expect(planToCsv(full)).not.toContain("Free blocks");
  });
});
