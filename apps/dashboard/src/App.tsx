import { useCallback, useEffect, useState } from "react";
import { api, type AuditEntry, type Health, type TransactionRecord } from "./api";
import { StatusBar } from "./components/StatusBar";
import { TransactionFeed } from "./components/TransactionFeed";
import { TransactionDetail } from "./components/TransactionDetail";
import { AuditPanel } from "./components/AuditPanel";
import { AttackSimulator } from "./components/AttackSimulator";

export function App({ onBack }: { onBack?: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextTransactions, nextAudit] = await Promise.all([
        api.health(),
        api.transactions(),
        api.audit(),
      ]);
      setHealth(nextHealth);
      setTransactions(nextTransactions);
      setAudit(nextAudit.entries);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const active =
    transactions.find((record) => record.transaction_id === selected) ?? transactions[0] ?? null;

  return (
    <div className="app">
      <header className="masthead">
        <h1>Mandate Shield</h1>
        <p className="tagline">
          A valid signature does not guarantee valid intent. Five deterministic checks stand between
          the agent and the mandate.
        </p>
        {onBack && (
          <button type="button" className="console-back" onClick={onBack}>
            Back to overview
          </button>
        )}
      </header>

      {health && <StatusBar health={health} />}

      <AttackSimulator transactions={transactions} onDone={refresh} onError={setError} />

      {error && <p className="error">{error}</p>}

      <div className="columns">
        <TransactionFeed
          transactions={transactions}
          selectedId={active?.transaction_id ?? null}
          onSelect={setSelected}
        />
        {active ? (
          <TransactionDetail record={active} />
        ) : (
          <section className="panel">
            <header>
              <h2>Evidence</h2>
            </header>
            <p className="empty">Select a transaction to see what the shield checked and why.</p>
          </section>
        )}
      </div>

      <AuditPanel
        entries={audit}
        chain={health?.audit_chain ?? null}
        persistence={health?.audit_persistence}
      />

      <p className="scope">
        Mandate Shield addresses 5 of the 48 threats catalogued in <em>Beyond the Mandate: A
        Systematic Security Analysis of the Agent Payments Protocol (AP2)</em> (arXiv:2608.23858),
        chosen for being concrete and directly relevant to a Razorpay-style mandate flow — not
        because the other 43 do not matter. No AI runs inside the verification path.
      </p>
    </div>
  );
}
