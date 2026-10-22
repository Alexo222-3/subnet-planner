import { describe, expect, it } from "vitest";
import {
  formatIPv4,
  isPrivateBlock,
  maskToPrefix,
  networkAddressOf,
  parseIPv4,
  parsePrefixLength,
  prefixToMask,
  rangeToCidrBlocks,
} from "./ip";

describe("parseIPv4", () => {
  it("parses valid addresses", () => {
    expect(parseIPv4("0.0.0.0")).toBe(0);
    expect(parseIPv4("192.168.1.10")).toBe(3232235786);
    expect(parseIPv4("255.255.255.255")).toBe(4294967295);
    expect(parseIPv4("  10.0.0.1  ")).toBe(167772161); // surrounding spaces are fine
  });

  it("handles addresses above 127.255.255.255 without going negative", () => {
    // This is the classic bug when using bitwise operators on IPs
    expect(parseIPv4("200.0.0.0")).toBe(3355443200);
  });

  it.each([
    "",
    "1.2.3",
    "1.2.3.4.5",
    "256.1.1.1",
    "1.2.3.-4",
    "a.b.c.d",
    "1.2.3.",
    "1..3.4",
    "1.2.3.4/24",
    "01.2.3.4", // leading zero is ambiguous
    "1.2. 3.4",
    "1.2.3.1000",
  ])("rejects %j", (bad) => {
    expect(parseIPv4(bad)).toBeNull();
  });
});

describe("formatIPv4", () => {
  it("round-trips with parseIPv4", () => {
    for (const ip of ["0.0.0.0", "10.20.30.40", "127.0.0.1", "128.0.0.0", "192.168.255.1", "255.255.255.255"]) {
      expect(formatIPv4(parseIPv4(ip)!)).toBe(ip);
    }
  });
});

describe("prefix and mask conversion", () => {
  it("parses prefix lengths", () => {
    expect(parsePrefixLength("24")).toBe(24);
    expect(parsePrefixLength("/24")).toBe(24);
    expect(parsePrefixLength("0")).toBe(0);
    expect(parsePrefixLength("32")).toBe(32);
    expect(parsePrefixLength("33")).toBeNull();
    expect(parsePrefixLength("-1")).toBeNull();
    expect(parsePrefixLength("2.5")).toBeNull();
    expect(parsePrefixLength("")).toBeNull();
    expect(parsePrefixLength("abc")).toBeNull();
  });

  it("converts prefix to mask", () => {
    expect(formatIPv4(prefixToMask(0))).toBe("0.0.0.0");
    expect(formatIPv4(prefixToMask(8))).toBe("255.0.0.0");
    expect(formatIPv4(prefixToMask(24))).toBe("255.255.255.0");
    expect(formatIPv4(prefixToMask(26))).toBe("255.255.255.192");
    expect(formatIPv4(prefixToMask(30))).toBe("255.255.255.252");
    expect(formatIPv4(prefixToMask(32))).toBe("255.255.255.255");
  });

  it("converts mask to prefix, and round-trips every prefix", () => {
    for (let p = 0; p <= 32; p++) {
      expect(maskToPrefix(formatIPv4(prefixToMask(p)))).toBe(p);
    }
  });

  it("rejects masks that aren't a run of 1s then 0s", () => {
    expect(maskToPrefix("255.0.255.0")).toBeNull();
    expect(maskToPrefix("255.255.255.1")).toBeNull();
    expect(maskToPrefix("0.0.0.255")).toBeNull(); // that's a wildcard, not a mask
    expect(maskToPrefix("not a mask")).toBeNull();
  });
});

describe("networkAddressOf", () => {
  it("rounds an address down to its network", () => {
    expect(formatIPv4(networkAddressOf(parseIPv4("192.168.5.1")!, 16))).toBe("192.168.0.0");
    expect(formatIPv4(networkAddressOf(parseIPv4("192.168.1.77")!, 26))).toBe("192.168.1.64");
    expect(formatIPv4(networkAddressOf(parseIPv4("10.1.2.3")!, 32))).toBe("10.1.2.3");
    expect(formatIPv4(networkAddressOf(parseIPv4("200.1.2.3")!, 0))).toBe("0.0.0.0");
  });
});

describe("isPrivateBlock", () => {
  const priv = (cidr: string) => {
    const [ip, prefix] = cidr.split("/");
    return isPrivateBlock(parseIPv4(ip)!, Number(prefix));
  };

  it("accepts the three private ranges", () => {
    expect(priv("10.0.0.0/8")).toBe(true);
    expect(priv("10.5.0.0/16")).toBe(true);
    expect(priv("172.16.0.0/12")).toBe(true);
    expect(priv("172.31.255.0/24")).toBe(true);
    expect(priv("192.168.0.0/16")).toBe(true);
  });

  it("rejects public ranges and blocks that only partly overlap", () => {
    expect(priv("8.8.8.0/24")).toBe(false);
    expect(priv("172.32.0.0/16")).toBe(false);
    expect(priv("172.0.0.0/8")).toBe(false); // contains private space but isn't all private
    expect(priv("192.169.0.0/16")).toBe(false);
    expect(priv("11.0.0.0/8")).toBe(false);
  });
});

describe("rangeToCidrBlocks", () => {
  const asText = (start: string, count: number) =>
    rangeToCidrBlocks(parseIPv4(start)!, count).map((b) => `${formatIPv4(b.start)}/${b.prefix}`);

  it("returns nothing for an empty range", () => {
    expect(asText("192.168.0.0", 0)).toEqual([]);
  });

  it("returns one block when the range is exactly one aligned block", () => {
    expect(asText("192.168.0.0", 256)).toEqual(["192.168.0.0/24"]);
  });

  it("splits an unaligned range into the fewest aligned blocks", () => {
    expect(asText("192.168.0.96", 160)).toEqual(["192.168.0.96/27", "192.168.0.128/25"]);
    expect(asText("192.168.0.4", 12)).toEqual(["192.168.0.4/30", "192.168.0.8/29"]);
    expect(asText("192.168.0.1", 3)).toEqual(["192.168.0.1/32", "192.168.0.2/31"]);
  });

  it("always covers exactly the requested addresses with no gaps", () => {
    const start = parseIPv4("10.0.0.52")!;
    const blocks = rangeToCidrBlocks(start, 1000);
    let expectedNext = start;
    for (const block of blocks) {
      expect(block.start).toBe(expectedNext);
      expect(block.start % block.size).toBe(0);
      expectedNext += block.size;
    }
    expect(expectedNext).toBe(start + 1000);
  });
});
