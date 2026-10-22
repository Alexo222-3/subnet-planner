// Shared types for the subnet logic. Nothing in this folder knows about React or the
// browser, so it can be tested on its own and reused by any UI.

/** A problem (error) or heads-up (warning) to show the user. */
export interface Issue {
  /** Which input the message is about, so the UI can highlight the right box. */
  field: "startBlock" | "bufferPercent" | "departments" | "name" | "devices" | "vlanId" | "plan";
  message: string;
  /** For per-row issues: which row, counting from 0 in the order the user entered them. */
  departmentIndex?: number;
}

/** One row of user input. */
export interface DepartmentInput {
  name: string;
  devices: number;
  /** Optional. Leave out and the planner suggests 10, 20, 30... */
  vlanId?: number | null;
}

export interface PlanInput {
  /** Starting block in CIDR form, e.g. "192.168.0.0/16". */
  startBlock: string;
  /** Growth buffer as a percentage, 0 to 100. Defaults to 20. */
  bufferPercent?: number;
  departments: DepartmentInput[];
}

/** A CIDR block written out as text, e.g. 192.168.0.96/27. */
export interface CidrBlock {
  network: string;
  prefix: number;
  size: number;
}

/** Everything the calculator knows about one subnet. */
export interface SubnetDetails {
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  /** null for /31 and /32, which have no broadcast address. */
  broadcast: string | null;
  firstUsable: string;
  lastUsable: string;
  totalAddresses: number;
  usableHosts: number;
  /** "point-to-point" = /31 (RFC 3021), "single-host" = /32. */
  kind: "normal" | "point-to-point" | "single-host";
}

/** One department's slice of the network. */
export interface SubnetAllocation {
  name: string;
  devices: number;
  /** devices + growth buffer + 3 (network, broadcast, gateway), before rounding up. */
  requiredAddresses: number;
  /** Block size after rounding up to a power of two. */
  size: number;
  prefix: number;
  mask: string;
  network: string;
  firstUsable: string;
  lastUsable: string;
  gateway: string;
  broadcast: string;
  usableHosts: number;
  /** Usable addresses left after the gateway and the devices (includes the growth buffer). */
  unused: number;
  vlanId: number;
  /** Row number in the user's original list (0-based). */
  entryIndex: number;
}

export interface PlanSummary {
  /** Total addresses in the starting block. */
  blockSize: number;
  /** Addresses handed out to subnets (sum of the block sizes). */
  allocatedAddresses: number;
  /** Addresses taken by network + broadcast + gateway in every subnet (3 each). */
  overheadAddresses: number;
  /** Total devices requested. */
  deviceCount: number;
  /** Spare addresses inside subnets, i.e. the growth room that nobody is using yet. */
  unusedInsideSubnets: number;
  /** Addresses in the starting block that haven't been given to anyone. */
  freeAddresses: number;
  /** The free space as ready-to-use CIDR blocks. */
  freeBlocks: CidrBlock[];
}

export interface NetworkPlan {
  startBlock: { network: string; prefix: number; mask: string; size: number };
  bufferPercent: number;
  /** In address order (lowest address first). */
  subnets: SubnetAllocation[];
  summary: PlanSummary;
}

export type PlanResult =
  | { ok: true; plan: NetworkPlan; warnings: Issue[] }
  | {
      ok: false;
      errors: Issue[];
      warnings: Issue[];
      /** Only set when the plan failed because it doesn't fit. */
      fit?: { totalRequired: number; blockSize: number; shortfall: number };
    };
