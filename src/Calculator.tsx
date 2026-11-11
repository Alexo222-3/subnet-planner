// The standalone calculator tab: type an IP and a prefix (/24) or mask (255.255.255.0).
// Every value has a copy button, and "Copy all" copies the lot as plain text.
import { useState } from "react";
import { calculateSubnet } from "./subnet";
import CopyButton, { copyText } from "./CopyButton";

export default function Calculator() {
  const [ip, setIp] = useState("192.168.1.10");
  const [prefixOrMask, setPrefixOrMask] = useState("/24");
  const [copied, setCopied] = useState(false);
  const result = calculateSubnet(ip, prefixOrMask); // cheap, so no useMemo needed

  // [label, value to show, value to copy (null = nothing worth copying)]
  const fields: [string, string, string | null][] = result.ok
    ? [
        ["Network address", `${result.details.network}/${result.details.prefix}`, `${result.details.network}/${result.details.prefix}`],
        ["Subnet mask", result.details.mask, result.details.mask],
        ["Wildcard mask", result.details.wildcard, result.details.wildcard],
        ["Broadcast address", result.details.broadcast ?? "none (/31 and /32 have no broadcast)", result.details.broadcast],
        ["First usable host", result.details.firstUsable, result.details.firstUsable],
        ["Last usable host", result.details.lastUsable, result.details.lastUsable],
        ["Total addresses", result.details.totalAddresses.toLocaleString("en-GB"), String(result.details.totalAddresses)],
        ["Usable hosts", result.details.usableHosts.toLocaleString("en-GB"), String(result.details.usableHosts)],
      ]
    : [];

  const copyAll = async () => {
    if (await copyText(fields.map(([label, shown]) => `${label}: ${shown}`).join("\n"))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <section>
      <div className="row">
        <label>
          IP address
          <input value={ip} onChange={(e) => setIp(e.target.value)} />
        </label>
        <label>
          CIDR or subnet mask
          <input value={prefixOrMask} onChange={(e) => setPrefixOrMask(e.target.value)} />
        </label>
      </div>

      {!result.ok && <p className="msg error">{result.error}</p>}
      {result.ok && (
        <>
          <dl>
            {fields.map(([label, shown, copy]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>
                  {shown}
                  {copy !== null && <CopyButton text={copy} label={label.toLowerCase()} />}
                </dd>
              </div>
            ))}
            {result.details.kind === "point-to-point" && <dd className="note">/31: a point-to-point link where both addresses are usable (RFC 3021).</dd>}
            {result.details.kind === "single-host" && <dd className="note">/32: a single host address.</dd>}
          </dl>
          <button onClick={copyAll}>{copied ? "Copied ✓" : "Copy all"}</button>
        </>
      )}
    </section>
  );
}
