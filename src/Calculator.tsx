// The standalone calculator tab: type an IP and a prefix (/24) or mask (255.255.255.0).
import { useState } from "react";
import { calculateSubnet } from "./subnet";

export default function Calculator() {
  const [ip, setIp] = useState("192.168.1.10");
  const [prefixOrMask, setPrefixOrMask] = useState("/24");
  const result = calculateSubnet(ip, prefixOrMask); // cheap, so no useMemo needed

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
        <dl>
          <dt>Network address</dt><dd>{result.details.network}/{result.details.prefix}</dd>
          <dt>Subnet mask</dt><dd>{result.details.mask}</dd>
          <dt>Wildcard mask</dt><dd>{result.details.wildcard}</dd>
          <dt>Broadcast address</dt><dd>{result.details.broadcast ?? "none (/31 and /32 have no broadcast)"}</dd>
          <dt>First usable host</dt><dd>{result.details.firstUsable}</dd>
          <dt>Last usable host</dt><dd>{result.details.lastUsable}</dd>
          <dt>Total addresses</dt><dd>{result.details.totalAddresses.toLocaleString("en-GB")}</dd>
          <dt>Usable hosts</dt><dd>{result.details.usableHosts.toLocaleString("en-GB")}</dd>
          {result.details.kind === "point-to-point" && <dd className="note">/31: a point-to-point link where both addresses are usable (RFC 3021).</dd>}
          {result.details.kind === "single-host" && <dd className="note">/32: a single host address.</dd>}
        </dl>
      )}
    </section>
  );
}
