import { shortHash, type AuditEntry, type ChainResult } from "../api";

interface Props {
  entries: AuditEntry[];
  chain: ChainResult | null;
  /** Set when the host cannot persist the chain, so the UI can say so. */
  persistence?: string;
}

/**
 * The audit log, shown with each entry's link to the one before it. Editing
 * any past entry breaks every hash after it, which is what the integrity
 * indicator in the header reports.
 */
export function AuditPanel({ entries, chain, persistence }: Props) {
  return (
    <section className="panel audit">
      <header>
        <h2>Audit log, hash-chained</h2>
        {chain && (
          <span className={`chain-state ${chain.intact ? "intact" : "broken"}`}>
            {chain.intact ? "chain intact" : `chain broken at entry ${chain.brokenAtIndex}`}
          </span>
        )}
      </header>

      {persistence && <p className="audit-note">{persistence}</p>}

      <div className="audit-list">
        {entries.length === 0 ? (
          <p className="empty">Every decision, pass or block, gets written here.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.entry_id} className="audit-entry">
              <span className={`verdict ${entry.decision === "BLOCK" ? "block" : "pass"}`}>
                {entry.decision}
              </span>
              <div>
                <div className="chainlink">
                  {shortHash(entry.prev_entry_hash)} → {shortHash(entry.entry_hash)}
                </div>
                <div className="failed">
                  {entry.failed_checks.length > 0
                    ? entry.failed_checks.join(", ")
                    : "all checks passed"}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
