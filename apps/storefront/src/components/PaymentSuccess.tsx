import { formatPaise, shortHash } from "../api.js";
import type { ChainResult, TransactionRecord } from "../types.js";

interface PaymentSuccessProps {
  records: TransactionRecord[];
  chain: ChainResult | null;
  onBack: () => void;
}

export function PaymentSuccess({ records, chain, onBack }: PaymentSuccessProps) {
  const paid = records.filter((r) => r.verdict.decision === "PASS");
  const held = records.filter((r) => r.verdict.decision === "BLOCK");
  const total = paid.reduce((sum, r) => sum + r.snapshot.raw_payload_for_signing.amount_paise, 0);

  return (
    <section className="success">
      <span className="success-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path
            d="M9 16.5l5 5 9-11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <h1 className="success-title">Payment complete</h1>
      <p className="success-sub">
        {paid.length} item{paid.length === 1 ? "" : "s"} authorized and paid, verified by Mandate
        Shield before the mandate was signed.
      </p>

      <dl className="success-facts">
        <div>
          <dt>Amount</dt>
          <dd>{formatPaise(total)}</dd>
        </div>
        <div>
          <dt>Transactions</dt>
          <dd>{records.length}</dd>
        </div>
        <div>
          <dt>Audit chain</dt>
          <dd>
            {chain
              ? `${chain.intact ? "intact" : `broken at ${chain.brokenAtIndex}`} · ${chain.entryCount} entries`
              : "unavailable"}
          </dd>
        </div>
      </dl>

      <ul className="success-list">
        {records.map((record) => (
          <li key={record.transaction_id}>
            <span className={`pill pill-${record.verdict.decision.toLowerCase()}`}>
              {record.verdict.decision}
            </span>
            <span className="success-item">{record.snapshot.cart.items[0]?.name}</span>
            <span className="success-hash">{shortHash(record.audit_entry.entry_hash)}</span>
          </li>
        ))}
      </ul>

      {held.length > 0 ? (
        <p className="success-held">
          {held.length} item{held.length === 1 ? " was" : "s were"} held and not charged. Each has a
          payment link you can complete yourself.
        </p>
      ) : null}

      <button className="btn btn-primary btn-lg" onClick={onBack} type="button">
        Back to store
      </button>
    </section>
  );
}
