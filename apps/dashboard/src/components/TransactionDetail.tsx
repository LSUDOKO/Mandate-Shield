import { formatPaise, shortHash, type TransactionRecord } from "../api";
import { CHECK_LABELS } from "./CheckLadder";

/**
 * The evidence view. Rendered and signed values sit side by side because that
 * comparison is the whole point of Check 1 — if they differ, the eye should
 * catch it before the text explains it.
 */
export function TransactionDetail({ record }: { record: TransactionRecord }) {
  const { snapshot, verdict, gateway } = record;
  const blocked = verdict.decision === "BLOCK";

  const signedAmount = snapshot.raw_payload_for_signing.amount_paise;
  const shownAmount = snapshot.rendered_view.display_total;
  const amountsAgree = shownAmount === formatPaise(signedAmount);
  const merchantsAgree =
    snapshot.rendered_view.display_merchant === snapshot.raw_payload_for_signing.merchant_id;

  return (
    <section className="panel">
      <header>
        <h2>Evidence</h2>
        <span style={{ color: "var(--dim)", fontSize: 11 }}>
          snapshot {shortHash(snapshot.snapshot_hash)}
        </span>
      </header>

      <div className="detail">
        <div className={`banner ${blocked ? "block" : "pass"}`}>{verdict.reason}</div>

        <p className="section-label">Shown to approver vs. sent for signing</p>
        <div className="compare">
          <div>
            <span className="section-label">Rendered view</span>
            <div className={`amount ${amountsAgree ? "" : "mismatch"}`}>{shownAmount}</div>
            <div className="kv">
              <span className="k">merchant</span>
              <span className={`v ${merchantsAgree ? "" : "mismatch"}`}>
                {snapshot.rendered_view.display_merchant}
              </span>
            </div>
          </div>

          <div>
            <span className="section-label">Signing payload</span>
            <div className={`amount ${amountsAgree ? "" : "mismatch"}`}>
              {formatPaise(signedAmount)}
            </div>
            <div className="kv">
              <span className="k">merchant</span>
              <span className="v">{snapshot.raw_payload_for_signing.merchant_id}</span>
            </div>
          </div>
        </div>

        <p className="section-label">Checks</p>
        <div className="checks">
          {verdict.results.map((result) => (
            <div key={result.check} className={`check ${result.passed ? "pass" : "fail"}`}>
              <span className="mark">{result.passed ? "✓" : "✕"}</span>
              <div>
                <div className="name">
                  <span>{CHECK_LABELS[result.check] ?? result.check}</span>
                  <span className="threats">{result.threat_ids.join(" · ")}</span>
                </div>
                <p className="reason">{result.reason}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="section-label">Field provenance</p>
        <div className="provenance">
          {Object.entries(snapshot.field_provenance).map(([field, source]) => {
            const suspect = source === "agent_inferred" || source === "catalog";
            return (
              <span key={field} className={`tag ${suspect ? "suspect" : ""}`}>
                {field} <span className="src">{source}</span>
              </span>
            );
          })}
        </div>

        <p className="section-label">Outcome</p>
        <div className="gateway">
          {gateway.kind === "order" && (
            <>
              <div className="kv">
                <span className="k">Razorpay order</span>
                <span className="v">{gateway.id}</span>
              </div>
              <div className="kv">
                <span className="k">mode</span>
                <span className="v">{gateway.mode}</span>
              </div>
            </>
          )}

          {gateway.kind === "payment_link" && (
            <>
              <p style={{ margin: "0 0 8px", fontFamily: "var(--sans)", color: "var(--dim)" }}>
                Blocked, so the purchase was handed back to the customer to complete with a normal
                UPI PIN or OTP. The agent is out of the loop; the customer is not.
              </p>
              <div className="kv">
                <span className="k">payment link</span>
                <span className="v">
                  <a href={gateway.short_url} target="_blank" rel="noreferrer">
                    {gateway.short_url}
                  </a>
                </span>
              </div>
              <div className="kv">
                <span className="k">mode</span>
                <span className="v">{gateway.mode}</span>
              </div>
            </>
          )}

          {gateway.kind === "none" && (
            <div className="kv">
              <span className="k">gateway unavailable</span>
              <span className="v">{gateway.reason}</span>
            </div>
          )}

          <div className="kv">
            <span className="k">audit entry</span>
            <span className="v">{shortHash(record.audit_entry.entry_hash)}</span>
          </div>
          <div className="kv">
            <span className="k">chained to</span>
            <span className="v">{shortHash(record.audit_entry.prev_entry_hash)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
