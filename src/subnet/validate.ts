// Checks the user's input and collects ALL the problems at once, so the UI can show
// every message together instead of making the user fix them one at a time.

import {
  formatIPv4,
  isPrivateBlock,
  networkAddressOf,
  parseIPv4,
  parsePrefixLength,
} from "./ip";
import { DEFAULT_BUFFER_PERCENT } from "./sizing";
import type { Issue, PlanInput } from "./types";

export const MIN_START_PREFIX = 8; // biggest block we accept: /8 (16.7 million addresses)
export const MAX_START_PREFIX = 29; // smallest block we accept: /29 (8 addresses)
export const MAX_DEVICES = 2 ** 24; // a /8 holds 16,777,216 addresses, so no department can have more
export const MIN_VLAN = 1;
export const MAX_VLAN = 4094; // 0 and 4095 are reserved by the 802.1Q standard
export const CISCO_RESERVED_VLANS = [1002, 1003, 1004, 1005];

export interface ValidDepartment {
  name: string; // trimmed
  devices: number;
  vlanId: number | null; // null = suggest one later
  entryIndex: number;
}

export interface ValidInput {
  startNetwork: number;
  startPrefix: number;
  bufferPercent: number;
  departments: ValidDepartment[];
}

export type ValidationResult =
  | { ok: true; value: ValidInput; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] };

export function validateInput(input: PlanInput): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  // ---- Growth buffer: 0 to 100 ----
  const bufferPercent = input.bufferPercent ?? DEFAULT_BUFFER_PERCENT;
  if (!Number.isFinite(bufferPercent) || bufferPercent < 0 || bufferPercent > 100) {
    errors.push({ field: "bufferPercent", message: "Growth buffer must be a number from 0 to 100 (percent)." });
  }

  // ---- Starting block, e.g. "192.168.0.0/16" ----
  let startNetwork = 0;
  let startPrefix = 0;
  const startParts = input.startBlock.trim().split("/");

  if (startParts.length !== 2) {
    errors.push({
      field: "startBlock",
      message: "Starting block should look like 192.168.0.0/16: an IP address, a slash, then a prefix length.",
    });
  } else {
    const address = parseIPv4(startParts[0]);
    const prefix = parsePrefixLength(startParts[1]);

    if (address === null) {
      errors.push({ field: "startBlock", message: `"${startParts[0].trim()}" isn't a valid IPv4 address.` });
    } else if (prefix === null) {
      errors.push({
        field: "startBlock",
        message: `"${startParts[1].trim()}" isn't a valid prefix length. Use a whole number from 0 to 32.`,
      });
    } else if (prefix < MIN_START_PREFIX || prefix > MAX_START_PREFIX) {
      errors.push({
        field: "startBlock",
        message: `The starting block must be between /${MIN_START_PREFIX} and /${MAX_START_PREFIX}. You entered /${prefix}.`,
      });
    } else {
      startPrefix = prefix;
      startNetwork = networkAddressOf(address, prefix);

      // 192.168.5.1/16 isn't a network address (it has bits set inside the host part).
      // We fix it up and tell the user rather than rejecting it.
      if (startNetwork !== address) {
        warnings.push({
          field: "startBlock",
          message: `${formatIPv4(address)}/${prefix} isn't a network address, so it was corrected to ${formatIPv4(startNetwork)}/${prefix}.`,
        });
      }
      if (!isPrivateBlock(startNetwork, prefix)) {
        warnings.push({
          field: "startBlock",
          message: "This isn't a private range. Internal networks should use 10.x.x.x, 172.16-31.x.x or 192.168.x.x.",
        });
      }
    }
  }

  // ---- Departments ----
  if (input.departments.length === 0) {
    errors.push({ field: "departments", message: "Add at least one department." });
  }

  const departments: ValidDepartment[] = [];
  const seenNames = new Map<string, number>(); // lowercase name -> first row it appeared on
  const seenVlans = new Map<number, number>(); // vlan id -> first row it appeared on

  input.departments.forEach((dept, index) => {
    const row = index + 1; // humans count from 1
    const name = dept.name.trim();
    let rowOk = true;

    if (name === "") {
      errors.push({ field: "name", departmentIndex: index, message: `Row ${row}: department name is empty.` });
      rowOk = false;
    } else {
      const key = name.toLowerCase();
      const firstRow = seenNames.get(key);
      if (firstRow !== undefined) {
        errors.push({
          field: "name",
          departmentIndex: index,
          message: `Row ${row}: "${name}" is already used on row ${firstRow}. Names aren't case-sensitive.`,
        });
        rowOk = false;
      } else {
        seenNames.set(key, row);
      }
    }

    if (!Number.isInteger(dept.devices) || dept.devices < 1) {
      errors.push({
        field: "devices",
        departmentIndex: index,
        message: `Row ${row}: devices must be a whole number of at least 1.`,
      });
      rowOk = false;
    } else if (dept.devices > MAX_DEVICES) {
      errors.push({
        field: "devices",
        departmentIndex: index,
        message: `Row ${row}: ${dept.devices.toLocaleString("en-GB")} devices is too many for any supported block.`,
      });
      rowOk = false;
    }

    let vlanId: number | null = null;
    if (dept.vlanId !== undefined && dept.vlanId !== null) {
      if (!Number.isInteger(dept.vlanId) || dept.vlanId < MIN_VLAN || dept.vlanId > MAX_VLAN) {
        errors.push({
          field: "vlanId",
          departmentIndex: index,
          message: `Row ${row}: VLAN ID must be a whole number from ${MIN_VLAN} to ${MAX_VLAN}.`,
        });
        rowOk = false;
      } else {
        const firstRow = seenVlans.get(dept.vlanId);
        if (firstRow !== undefined) {
          errors.push({
            field: "vlanId",
            departmentIndex: index,
            message: `Row ${row}: VLAN ${dept.vlanId} is already used on row ${firstRow}.`,
          });
          rowOk = false;
        } else {
          seenVlans.set(dept.vlanId, row);
          vlanId = dept.vlanId;
          if (dept.vlanId === 1) {
            warnings.push({
              field: "vlanId",
              departmentIndex: index,
              message: `Row ${row}: VLAN 1 is the default VLAN on most switches. It's best not to use it for a department.`,
            });
          } else if (CISCO_RESERVED_VLANS.includes(dept.vlanId)) {
            warnings.push({
              field: "vlanId",
              departmentIndex: index,
              message: `Row ${row}: VLANs 1002-1005 are reserved on Cisco switches.`,
            });
          }
        }
      }
    }

    if (rowOk) departments.push({ name, devices: dept.devices, vlanId, entryIndex: index });
  });

  if (errors.length > 0) return { ok: false, errors, warnings };

  return { ok: true, value: { startNetwork, startPrefix, bufferPercent, departments }, warnings };
}
