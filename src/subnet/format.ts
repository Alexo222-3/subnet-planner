// Turns a finished plan into text you can paste somewhere: Markdown (for files and docs),
// plain text + an HTML table (for Teams / email). Pure functions, no browser needed.
import type { NetworkPlan, SubnetAllocation } from "./types";
import { requiredAddresses, OVERHEAD_ADDRESSES } from "./sizing";

const n = (x: number) => x.toLocaleString("en-GB");
const cidr = (s: SubnetAllocation) => `${s.network}/${s.prefix}`;
const range = (s: SubnetAllocation) => `${s.firstUsable} - ${s.lastUsable}`;

/** Spare addresses the growth buffer adds on top of the devices (120 devices at 20% -> 24). */
export function growthAddresses(devices: number, bufferPercent: number): number {
  return requiredAddresses(devices, bufferPercent) - OVERHEAD_ADDRESSES - devices;
}

export const FREE_NOTE =
  "Free = usable hosts - 1 gateway - devices. It includes the growth buffer, plus whatever is left because subnet sizes round up to a power of two.";

const header = (p: NetworkPlan) => `${p.startBlock.network}/${p.startBlock.prefix}, ${p.bufferPercent}% growth buffer`;
const freeBlocks = (p: NetworkPlan) => p.summary.freeBlocks.map((b) => `${b.network}/${b.prefix}`).join(", ");

export function planToMarkdown(plan: NetworkPlan): string {
  const esc = (t: string) => t.replace(/\|/g, "\\|");
  const lines = [
    "# Subnet plan",
    "",
    `Starting block ${header(plan)}`,
    "",
    "| Department | VLAN | Network | Mask | Gateway | Usable range | Broadcast | Devices | Growth buffer | Usable hosts | Free |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...plan.subnets.map(
      (s) =>
        `| ${esc(s.name)} | ${s.vlanId} | ${cidr(s)} | ${s.mask} | ${s.gateway} | ${range(s)} | ${s.broadcast} | ${n(s.devices)} | ${n(growthAddresses(s.devices, plan.bufferPercent))} | ${n(s.usableHosts)} | ${n(s.unused)} |`,
    ),
    "",
    `_${FREE_NOTE}_`,
    "",
    "## Summary",
    "",
    `- Starting block size: ${n(plan.summary.blockSize)} addresses`,
    `- Allocated: ${n(plan.summary.allocatedAddresses)}`,
    `- Still free: ${n(plan.summary.freeAddresses)}`,
  ];
  if (plan.summary.freeBlocks.length) lines.push(`- Free blocks: ${freeBlocks(plan)}`);
  return lines.join("\n") + "\n";
}

/** One short block per department, easy to read as plain text in a chat. */
export function planToText(plan: NetworkPlan): string {
  const blocks = plan.subnets.map((s) =>
    [
      `${s.name} (VLAN ${s.vlanId})`,
      `Network: ${cidr(s)}`,
      `Mask: ${s.mask}`,
      `Gateway: ${s.gateway}`,
      `Usable range: ${range(s)}`,
      `Broadcast: ${s.broadcast}`,
      `Devices: ${n(s.devices)} | Usable hosts: ${n(s.usableHosts)} | Free: ${n(s.unused)}`,
    ].join("\n"),
  );
  const tail = [`Still free: ${n(plan.summary.freeAddresses)} addresses`];
  if (plan.summary.freeBlocks.length) tail.push(`Free blocks: ${freeBlocks(plan)}`);
  return [`Subnet plan - ${header(plan)}`, ...blocks, tail.join("\n")].join("\n\n");
}

const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The same plan as an HTML table: Teams and email render this when you paste. */
export function planToHtml(plan: NetworkPlan): string {
  const th = "border:1px solid #999;padding:4px 8px;text-align:left;background:#eee";
  const td = "border:1px solid #999;padding:4px 8px";
  const head = ["Department", "VLAN", "Network", "Mask", "Gateway", "Usable range", "Broadcast", "Devices", "Usable hosts", "Free"];
  const rows = plan.subnets.map(
    (s) =>
      "<tr>" +
      [s.name, s.vlanId, cidr(s), s.mask, s.gateway, range(s), s.broadcast, n(s.devices), n(s.usableHosts), n(s.unused)]
        .map((c) => `<td style="${td}">${html(String(c))}</td>`)
        .join("") +
      "</tr>",
  );
  return (
    `<p><b>Subnet plan</b> - ${html(header(plan))}</p>` +
    `<table style="border-collapse:collapse"><tr>${head.map((h) => `<th style="${th}">${h}</th>`).join("")}</tr>${rows.join("")}</table>` +
    `<p>Still free: ${n(plan.summary.freeAddresses)} addresses${plan.summary.freeBlocks.length ? ` (${html(freeBlocks(plan))})` : ""}</p>`
  );
}
