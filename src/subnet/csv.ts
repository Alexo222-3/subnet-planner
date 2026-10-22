// Turns a finished network plan into CSV text, ready to save as a .csv file.
//
// CSV is a plain-text format where each line is a row and commas separate the
// columns. Excel, Google Sheets and Numbers all open it directly.
//
// This is a pure function (text in, text out) — the browser-specific part
// (triggering the download) lives in the UI.

import type { NetworkPlan } from "./types";

/**
 * Escape one value for CSV. If the text contains a comma, a double quote or a
 * line break, the whole field must be wrapped in double quotes, and any
 * double quotes inside it are doubled (CSV standard, RFC 4180).
 * Example: the department name `Sales, "North"` becomes `"Sales, ""North"""`.
 */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Join one row of values into a CSV line. */
function csvRow(values: (string | number)[]): string {
  return values.map((v) => csvField(String(v))).join(",");
}

/** Column headers for the per-department section, in table order. */
const SUBNET_COLUMNS = [
  "Department",
  "VLAN",
  "Network (CIDR)",
  "Subnet mask",
  "Gateway",
  "First usable",
  "Last usable",
  "Broadcast",
  "Devices requested",
  "Usable hosts",
  "Unused addresses",
];

/**
 * Build the CSV text for a plan.
 *
 * Layout (so the file stays readable when opened as plain text too):
 *   1. a header block: what this is, when it was generated, the inputs
 *   2. the per-department table (one CIDR column, e.g. 192.168.0.0/26)
 *   3. the summary numbers and the free blocks
 */
export function planToCsv(plan: NetworkPlan, generatedAt: Date = new Date()): string {
  const lines: string[] = [];

  // ---- 1. Header block ----
  lines.push(csvRow(["Subnet plan"]));
  lines.push(csvRow(["Generated", generatedAt.toISOString()]));
  lines.push(csvRow(["Starting block", `${plan.startBlock.network}/${plan.startBlock.prefix}`]));
  lines.push(csvRow(["Growth buffer", `${plan.bufferPercent}%`]));
  lines.push("");

  // ---- 2. Per-department rows ----
  lines.push(csvRow(SUBNET_COLUMNS));
  for (const s of plan.subnets) {
    lines.push(
      csvRow([
        s.name,
        s.vlanId,
        `${s.network}/${s.prefix}`, // one CIDR column, the way people write subnets
        s.mask,
        s.gateway,
        s.firstUsable,
        s.lastUsable,
        s.broadcast,
        s.devices,
        s.usableHosts,
        s.unused,
      ]),
    );
  }
  lines.push("");

  // ---- 3. Summary ----
  const summary = plan.summary;
  lines.push(csvRow(["Summary"]));
  lines.push(csvRow(["Starting block size (addresses)", summary.blockSize]));
  lines.push(csvRow(["Allocated to departments", summary.allocatedAddresses]));
  lines.push(csvRow(["Network, broadcast and gateway overhead", summary.overheadAddresses]));
  lines.push(csvRow(["Spare inside subnets (incl. growth)", summary.unusedInsideSubnets]));
  lines.push(csvRow(["Still free in starting block", summary.freeAddresses]));
  if (summary.freeBlocks.length > 0) {
    lines.push(
      csvRow(["Free blocks", ...summary.freeBlocks.map((b) => `${b.network}/${b.prefix}`)]),
    );
  }

  // A trailing newline makes the file friendlier to command-line tools.
  return lines.join("\n") + "\n";
}
