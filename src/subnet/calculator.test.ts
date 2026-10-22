import { describe, expect, it } from "vitest";
import { calculateSubnet } from "./calculator";

function details(ip: string, prefixOrMask: string | number) {
  const result = calculateSubnet(ip, prefixOrMask);
  if (!result.ok) throw new Error(result.error);
  return result.details;
}

describe("calculateSubnet: normal subnets", () => {
  it("handles a /24", () => {
    expect(details("192.168.1.10", 24)).toEqual({
      prefix: 24,
      mask: "255.255.255.0",
      wildcard: "0.0.0.255",
      network: "192.168.1.0",
      broadcast: "192.168.1.255",
      firstUsable: "192.168.1.1",
      lastUsable: "192.168.1.254",
      totalAddresses: 256,
      usableHosts: 254,
      kind: "normal",
    });
  });

  it("finds the right subnet when the IP is in the middle of one", () => {
    const d = details("192.168.1.77", 26);
    expect(d.network).toBe("192.168.1.64");
    expect(d.broadcast).toBe("192.168.1.127");
    expect(d.firstUsable).toBe("192.168.1.65");
    expect(d.lastUsable).toBe("192.168.1.126");
    expect(d.usableHosts).toBe(62);
  });

  it("handles a /30 (2 usable hosts)", () => {
    const d = details("10.0.0.5", 30);
    expect(d.network).toBe("10.0.0.4");
    expect(d.broadcast).toBe("10.0.0.7");
    expect(d.firstUsable).toBe("10.0.0.5");
    expect(d.lastUsable).toBe("10.0.0.6");
    expect(d.usableHosts).toBe(2);
    expect(d.kind).toBe("normal");
  });

  it("handles a /16 and a /8", () => {
    const sixteen = details("172.16.5.9", 16);
    expect(sixteen.network).toBe("172.16.0.0");
    expect(sixteen.broadcast).toBe("172.16.255.255");
    expect(sixteen.usableHosts).toBe(65534);

    const eight = details("10.200.1.1", 8);
    expect(eight.network).toBe("10.0.0.0");
    expect(eight.broadcast).toBe("10.255.255.255");
    expect(eight.usableHosts).toBe(16777214);
  });

  it("handles /0 without overflow", () => {
    const d = details("8.8.8.8", 0);
    expect(d.network).toBe("0.0.0.0");
    expect(d.broadcast).toBe("255.255.255.255");
    expect(d.totalAddresses).toBe(4294967296);
    expect(d.usableHosts).toBe(4294967294);
  });

  it("works for addresses in the upper half of the address space", () => {
    const d = details("200.100.50.25", 24);
    expect(d.network).toBe("200.100.50.0");
    expect(d.broadcast).toBe("200.100.50.255");
  });
});

describe("calculateSubnet: /31 and /32 special cases", () => {
  it("treats /31 as a point-to-point link where both addresses are usable (RFC 3021)", () => {
    const d = details("10.0.0.5", 31);
    expect(d.network).toBe("10.0.0.4");
    expect(d.firstUsable).toBe("10.0.0.4");
    expect(d.lastUsable).toBe("10.0.0.5");
    expect(d.broadcast).toBeNull();
    expect(d.usableHosts).toBe(2);
    expect(d.totalAddresses).toBe(2);
    expect(d.kind).toBe("point-to-point");
  });

  it("treats /32 as a single host", () => {
    const d = details("10.0.0.5", 32);
    expect(d.network).toBe("10.0.0.5");
    expect(d.firstUsable).toBe("10.0.0.5");
    expect(d.lastUsable).toBe("10.0.0.5");
    expect(d.broadcast).toBeNull();
    expect(d.usableHosts).toBe(1);
    expect(d.mask).toBe("255.255.255.255");
    expect(d.kind).toBe("single-host");
  });
});

describe("calculateSubnet: accepted formats", () => {
  it("accepts a number, a string, a slash prefix or a dotted mask", () => {
    const expected = details("192.168.1.10", 24);
    expect(details("192.168.1.10", "24")).toEqual(expected);
    expect(details("192.168.1.10", "/24")).toEqual(expected);
    expect(details("192.168.1.10", "255.255.255.0")).toEqual(expected);
    expect(details("  192.168.1.10 ", " /24 ")).toEqual(expected);
  });
});

describe("calculateSubnet: errors", () => {
  it.each([
    ["999.1.1.1", 24, /valid IPv4/],
    ["", 24, /valid IPv4/],
    ["192.168.1.1", 33, /prefix length/],
    ["192.168.1.1", -1, /prefix length/],
    ["192.168.1.1", "abc", /prefix length/],
    ["192.168.1.1", "", /prefix length/],
    ["192.168.1.1", "255.0.255.0", /subnet mask/],
    ["192.168.1.1", "255.255.255", /subnet mask/],
  ])("rejects ip=%j prefix=%j with a friendly message", (ip, prefix, pattern) => {
    const result = calculateSubnet(ip, prefix);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  });
});
