import { formatPaise, type TransactionRecord } from "../api";
import { CheckLadder } from "./CheckLadder";

interface Props {
  transactions: TransactionRecord[];
  selectedId: string | null;
  /** The row that just arrived from a submit, for its entrance animation. */
  arrivedId?: string | null;
  /** True while the first poll is still in flight. */
  loading?: boolean;
  onSelect: (id: string) => void;
}

/** Placeholder rows shaped like the feed items they will become. */
function Skeleton() {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <div className="skeleton" key={row}>
          <div className="skeleton-bar" style={{ width: `${72 - row * 12}%` }} />
          <div className="skeleton-bar" style={{ width: "38%" }} />
        </div>
      ))}
    </>
  );
}

export function TransactionFeed({
  transactions,
  selectedId,
  arrivedId,
  loading,
  onSelect,
}: Props) {
  const held = transactions.filter((t) => t.verdict.decision === "BLOCK").length;

  return (
    <section className="panel">
      <header>
        <h2>Transactions</h2>
        <span className="panel-meta">
          {held} held / {transactions.length} seen
        </span>
      </header>

      <div className="feed">
        {loading && transactions.length === 0 ? (
          <Skeleton />
        ) : transactions.length === 0 ? (
          <p className="empty">
            No transactions yet. Send an instruction to watch it move through the shield.
          </p>
        ) : (
          transactions.map((record) => {
            const blocked = record.verdict.decision === "BLOCK";
            return (
              <button
                key={record.transaction_id}
                type="button"
                className={`feed-item ${blocked ? "block" : "pass"}${
                  record.transaction_id === arrivedId ? " is-new" : ""
                }`}
                aria-current={record.transaction_id === selectedId}
                onClick={() => onSelect(record.transaction_id)}
              >
                <span className="top">
                  <span className="instruction">{record.instruction}</span>
                  <span className={`verdict ${blocked ? "block" : "pass"}`}>
                    {record.verdict.decision}
                  </span>
                </span>

                <span className="meta">
                  <span>{formatPaise(record.snapshot.raw_payload_for_signing.amount_paise)}</span>
                  <span>{record.snapshot.raw_payload_for_signing.merchant_id}</span>
                  {blocked && <span>{record.verdict.failed_checks.join(", ")}</span>}
                </span>

                <CheckLadder results={record.verdict.results} />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
