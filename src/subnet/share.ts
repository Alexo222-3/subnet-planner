// Share links: the plan's inputs are packed into text that goes after the # in the page
// address. Nothing is sent to a server. The page reads it back when someone opens the link.
import type { PlanInput } from "./types";
import type { LoadResult } from "./persistence";

const toB64 = (s: string): string => {
  let bin = "";
  new TextEncoder().encode(s).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (t: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function encodePlan(input: PlanInput): string {
  return toB64(
    JSON.stringify({
      v: 1,
      s: input.startBlock,
      b: input.bufferPercent ?? 20,
      d: input.departments.map((d) => [d.name, d.devices, d.vlanId ?? null]),
    }),
  );
}

const BAD = "That share link is damaged or incomplete, so the plan couldn't be opened.";

/** Never throws: a bad link comes back as a friendly error. The planner then validates the values. */
export function decodePlan(text: string): LoadResult {
  try {
    const raw = JSON.parse(fromB64(text));
    if (raw?.v !== 1 || typeof raw.s !== "string" || typeof raw.b !== "number" || !Array.isArray(raw.d) || raw.d.length > 200) {
      return { ok: false, error: BAD };
    }
    const departments = [];
    for (const d of raw.d) {
      const okVlan = d?.[2] === null || typeof d?.[2] === "number";
      if (!Array.isArray(d) || typeof d[0] !== "string" || typeof d[1] !== "number" || !okVlan) return { ok: false, error: BAD };
      departments.push({ name: d[0], devices: d[1], vlanId: d[2] as number | null });
    }
    return { ok: true, input: { startBlock: raw.s, bufferPercent: raw.b, departments } };
  } catch {
    return { ok: false, error: BAD };
  }
}
