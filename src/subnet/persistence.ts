// Save/load a plan as JSON.
//
// We save the INPUTS (starting block, buffer, department rows) — not the
// calculated plan. The plan is fully determined by the inputs, so saving them
// is smaller, and any future improvement to the maths automatically applies
// when an old file is loaded.
//
// Pure functions: the browser file picking/downloading lives in the UI.

import type { DepartmentInput, PlanInput } from "./types";

/**
 * The shape of a saved file. `app` and `version` let us recognise our own
 * files and change the format later without breaking old saves.
 */
export interface SavedPlan {
  app: "subnet-planner";
  version: 1;
  savedAt: string; // ISO timestamp, e.g. "2026-10-21T12:00:00.000Z"
  input: {
    startBlock: string;
    bufferPercent: number;
    departments: { name: string; devices: number; vlanId?: number | null }[];
  };
}

export type LoadResult =
  | { ok: true; input: PlanInput }
  | { ok: false; error: string };

/** Turn the current inputs into the JSON text to save. */
export function serializePlan(input: PlanInput, now: Date = new Date()): string {
  const saved: SavedPlan = {
    app: "subnet-planner",
    version: 1,
    savedAt: now.toISOString(),
    input: {
      startBlock: input.startBlock,
      bufferPercent: input.bufferPercent ?? 20,
      departments: input.departments.map((d) => ({
        name: d.name,
        devices: d.devices,
        // Keep the key even when empty (null) so the file reads clearly.
        vlanId: d.vlanId ?? null,
      })),
    },
  };
  return JSON.stringify(saved, null, 2);
}

/**
 * Parse the text of a saved file back into planner inputs.
 * Never throws: every failure comes back as a friendly error message.
 *
 * Note: this checks the SHAPE of the file (right fields, right types).
 * Whether the values make a valid plan (duplicate names, bad IPs, ...) is
 * checked by the planner itself, exactly as if the user had typed them.
 */
export function parseSavedPlan(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON. Pick a plan saved by this app." };
  }

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "That file doesn't look like a saved subnet plan." };
  }
  const file = raw as Record<string, unknown>;

  if (file.app !== "subnet-planner") {
    return { ok: false, error: "That file wasn't saved by the subnet planner." };
  }
  if (file.version !== 1) {
    return {
      ok: false,
      error: `That plan was saved with a newer format (version ${String(file.version)}) that this app can't read.`,
    };
  }

  const input = file.input as Record<string, unknown> | undefined;
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "The saved plan is missing its inputs." };
  }
  if (typeof input.startBlock !== "string") {
    return { ok: false, error: "The saved plan is missing the starting block." };
  }
  if (typeof input.bufferPercent !== "number") {
    return { ok: false, error: "The saved plan is missing the growth buffer." };
  }
  if (!Array.isArray(input.departments)) {
    return { ok: false, error: "The saved plan is missing its department list." };
  }

  const departments: DepartmentInput[] = [];
  for (let i = 0; i < input.departments.length; i++) {
    const d = input.departments[i] as Record<string, unknown>;
    if (typeof d !== "object" || d === null || typeof d.name !== "string" || typeof d.devices !== "number") {
      return { ok: false, error: `Department ${i + 1} in the saved file is damaged (expected a name and a device count).` };
    }
    const vlanId = d.vlanId;
    departments.push({
      name: d.name,
      devices: d.devices,
      vlanId: typeof vlanId === "number" ? vlanId : null,
    });
  }

  return {
    ok: true,
    input: {
      startBlock: input.startBlock,
      bufferPercent: input.bufferPercent,
      departments,
    },
  };
}
