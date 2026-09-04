import { shortHash } from "../api.js";

interface AuditBadgeProps {
  entryHash: string;
  chainIntact: boolean;
  entryCount?: number;
}

/**
 * The receipt for the decision itself.
 *
 * Each entry commits to the previous entry's hash, so editing any past decision
 * breaks the chain from that point on. What the badge claims is only that the
 * chain verifies right now, which is exactly what the ledger can prove.
 */
export function AuditBadge({ entryHash, chainIntact, entryCount }: AuditBadgeProps) {
  return (
    <div className={`audit-badge ${chainIntact ? "" : "audit-badge-broken"}`}>
      <span className="audit-dot" aria-hidden="true" />
      <div>
        <p className="audit-line">
          {chainIntact ? "Audit chain intact" : "Audit chain broken"}
          {typeof entryCount === "number" ? ` · ${entryCount} entries` : ""}
        </p>
        <p className="audit-hash">{shortHash(entryHash)}</p>
      </div>
    </div>
  );
}
