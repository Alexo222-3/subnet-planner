// The planner tab. The form holds plain text in state; on every change we convert it to
// numbers and call planNetwork (the pure function from phase 1). The plan is recalculated
// live, so there's no "submit" button.
//
// Phase 3 added the action buttons: export the plan as CSV, save the inputs as
// JSON, load a saved JSON file, and print. The buttons only do browser plumbing
// (file pickers, downloads, window.print) — all the real work is pure functions
// in src/subnet/ so it stays unit-tested.
import { useMemo, useRef, useState } from "react";
import { planNetwork, planToCsv, serializePlan, parseSavedPlan } from "./subnet";
import type { PlanInput } from "./subnet";

interface Row {
  id: number; // React needs a stable key per row
  name: string;
  devices: string; // kept as text so the box can be empty while typing
  vlan: string;
}

const toNumber = (text: string) => (text.trim() === "" ? NaN : Number(text));
const fmt = (n: number) => n.toLocaleString("en-GB");

/** Today's date as YYYY-MM-DD, used in downloaded file names. */
const dateStamp = () => new Date().toISOString().slice(0, 10);

/**
 * Offer `text` to the user as a downloaded file. Works by creating a
 * temporary link to an in-memory Blob and clicking it programmatically.
 */
function download(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url); // free the temporary URL
}

export default function Planner() {
  const [startBlock, setStartBlock] = useState("192.168.0.0/16");
  const [buffer, setBuffer] = useState("20");
  const [rows, setRows] = useState<Row[]>([
    { id: 1, name: "Sales", devices: "50", vlan: "" },
    { id: 2, name: "Engineering", devices: "120", vlan: "" },
    { id: 3, name: "HR", devices: "8", vlan: "" },
  ]);
  const [nextId, setNextId] = useState(4);
  // Message from the last "Load plan" attempt (null = nothing to report).
  const [loadMessage, setLoadMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // The hidden file picker that "Load plan" clicks on the user's behalf.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  /** The current form contents as planner inputs (used by save AND the live plan). */
  const currentInput = (): PlanInput => ({
    startBlock,
    bufferPercent: toNumber(buffer),
    departments: rows.map((r) => ({
      name: r.name,
      devices: toNumber(r.devices),
      vlanId: r.vlan.trim() === "" ? undefined : Number(r.vlan),
    })),
  });

  // useMemo = only redo the maths when an input actually changed
  const result = useMemo(() => planNetwork(currentInput()), [startBlock, buffer, rows]);

  const errors = result.ok ? [] : result.errors;
  // Used to put a red border on the exact box an error is about
  const bad = (field: string, index?: number) =>
    errors.some((e) => e.field === field && e.departmentIndex === index) ? "bad" : "";

  // ---- Phase 3 actions ----

  const exportCsv = () => {
    if (!result.ok) return; // button is disabled in this state anyway
    download(`subnet-plan-${dateStamp()}.csv`, planToCsv(result.plan), "text/csv");
  };

  const savePlan = () => {
    download(`subnet-plan-${dateStamp()}.json`, serializePlan(currentInput()), "application/json");
    setLoadMessage(null);
  };

  /** Called when the user picks a file in the hidden file picker. */
  const loadPlanFile = async (file: File) => {
    const parsed = parseSavedPlan(await file.text());
    if (!parsed.ok) {
      setLoadMessage({ ok: false, text: parsed.error });
      return;
    }
    // Refill the form with the saved inputs. New row ids keep React keys unique.
    setStartBlock(parsed.input.startBlock);
    setBuffer(String(parsed.input.bufferPercent));
    setRows(
      parsed.input.departments.map((d, i) => ({
        id: nextId + i,
        name: d.name,
        devices: String(d.devices),
        vlan: d.vlanId === undefined || d.vlanId === null ? "" : String(d.vlanId),
      })),
    );
    setNextId(nextId + parsed.input.departments.length);
    setLoadMessage({ ok: true, text: `Loaded "${file.name}".` });
  };

  return (
    <section>
      <div className="row no-print">
        <label>
          Starting block
          <input className={bad("startBlock")} value={startBlock} onChange={(e) => setStartBlock(e.target.value)} />
        </label>
        <label>
          Growth buffer (%)
          <input className={bad("bufferPercent")} value={buffer} onChange={(e) => setBuffer(e.target.value)} />
        </label>
      </div>

      <h2 className="no-print">Departments</h2>
      {rows.map((r, i) => (
        <div className="row no-print" key={r.id}>
          <input
            className={bad("name", i)}
            placeholder="Department name"
            value={r.name}
            onChange={(e) => setRow(r.id, { name: e.target.value })}
          />
          <input
            className={bad("devices", i)}
            placeholder="Devices"
            inputMode="numeric"
            value={r.devices}
            onChange={(e) => setRow(r.id, { devices: e.target.value })}
          />
          <input
            className={bad("vlanId", i)}
            placeholder="VLAN (auto)"
            inputMode="numeric"
            value={r.vlan}
            onChange={(e) => setRow(r.id, { vlan: e.target.value })}
          />
          <button onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`Remove ${r.name || "row"}`}>
            ✕
          </button>
        </div>
      ))}
      <div className="row no-print">
        <button
          onClick={() => {
            setRows((rs) => [...rs, { id: nextId, name: "", devices: "", vlan: "" }]);
            setNextId(nextId + 1);
          }}
        >
          + Add department
        </button>
      </div>

      <div className="row no-print">
        <button onClick={exportCsv} disabled={!result.ok} title={result.ok ? "" : "Fix the errors above first"}>
          Export CSV
        </button>
        <button onClick={savePlan}>Save plan (JSON)</button>
        <button onClick={() => fileInputRef.current?.click()}>Load plan…</button>
        <button onClick={() => window.print()} disabled={!result.ok} title={result.ok ? "" : "Fix the errors above first"}>
          Print
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadPlanFile(file);
            e.target.value = ""; // allow picking the same file again later
          }}
        />
      </div>

      {loadMessage && (
        <p className={`msg no-print ${loadMessage.ok ? "ok" : "error"}`}>{loadMessage.text}</p>
      )}

      {errors.length > 0 && (
        <ul className="msg error no-print">
          {errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <ul className="msg warn no-print">
          {result.warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      )}

      {result.ok && (
        <>
          {/* Shown on paper only — on screen the form already gives this context. */}
          <div className="print-only">
            <h1>Subnet plan</h1>
            <p>
              Starting block {result.plan.startBlock.network}/{result.plan.startBlock.prefix}
              {" · "}Growth buffer {result.plan.bufferPercent}%{" · "}Generated{" "}
              {new Date().toLocaleString("en-GB")}
            </p>
          </div>

          <h2>
            Plan for {result.plan.startBlock.network}/{result.plan.startBlock.prefix}
          </h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Department</th><th>VLAN</th><th>Network</th><th>Mask</th><th>Gateway</th>
                  <th>Usable range</th><th>Broadcast</th><th>Devices</th><th>Usable</th><th>Unused</th>
                </tr>
              </thead>
              <tbody>
                {result.plan.subnets.map((s) => (
                  <tr key={s.entryIndex}>
                    <td>{s.name}</td>
                    <td>{s.vlanId}</td>
                    <td>{s.network}/{s.prefix}</td>
                    <td>{s.mask}</td>
                    <td>{s.gateway}</td>
                    <td>{s.firstUsable} – {s.lastUsable}</td>
                    <td>{s.broadcast}</td>
                    <td>{fmt(s.devices)}</td>
                    <td>{fmt(s.usableHosts)}</td>
                    <td>{fmt(s.unused)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Summary</h2>
          <dl>
            <dt>Starting block size</dt><dd>{fmt(result.plan.summary.blockSize)} addresses</dd>
            <dt>Allocated</dt><dd>{fmt(result.plan.summary.allocatedAddresses)}</dd>
            <dt>Network, broadcast and gateway</dt><dd>{fmt(result.plan.summary.overheadAddresses)}</dd>
            <dt>Spare inside subnets (incl. growth)</dt><dd>{fmt(result.plan.summary.unusedInsideSubnets)}</dd>
            <dt>Still free</dt><dd>{fmt(result.plan.summary.freeAddresses)}</dd>
          </dl>
          {result.plan.summary.freeBlocks.length > 0 && (
            <p>
              Free blocks you can hand out later:{" "}
              {result.plan.summary.freeBlocks.map((b) => `${b.network}/${b.prefix}`).join(", ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
