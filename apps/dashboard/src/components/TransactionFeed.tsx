import { formatPaise, type TransactionRecord } from "../api";
import { CheckLadder } from "./CheckLadder";

interface Props {
  transactions: TransactionRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TransactionFeed({ transactions, selectedId, onSelect }: Props) {
  return (
    <section className="panel">
      <header>
        <h2>Transactions</h2>
        <span style={{ color: "var(--dim)", fontSize: 11 }}>
          {transactions.filter((t) => t.verdict.decision === "BLOCK").length} held /{" "}
          {transactions.length} seen
        </span>
      </header>

      <div className="feed">
        {transactions.length === 0 ? (
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
                className={`feed-item ${blocked ? "block" : "pass"}`}
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
