import { formatPaise, shortHash } from "../api.js";
import type { CartLine, TransactionRecord } from "../types.js";
import { VerificationPanel } from "./VerificationPanel.js";
import { AuditBadge } from "./AuditBadge.js";

export interface CheckoutLineState {
  line: CartLine;
  instruction: string;
  status: "pending" | "done" | "error";
  record?: TransactionRecord;
  error?: string;
}

interface CheckoutViewProps {
  states: CheckoutLineState[];
  onBack: () => void;
  onComplete: () => void;
}

function Decision({ record }: { record: TransactionRecord }) {
  const pass = record.verdict.decision === "PASS";
  const { gateway } = record;

  return (
    <div className={`decision ${pass ? "decision-pass" : "decision-block"}`}>
      <div className="decision-head">
        <span className="decision-label">{pass ? "Authorized" : "Held for your approval"}</span>
        <span className="decision-verdict">{record.verdict.decision}</span>
      </div>

      {pass ? (
        <p className="decision-copy">
          Every scope-affecting field traces to what you asked for. This payment is safe to sign.
        </p>
      ) : (
        <p className="decision-copy">
          {record.verdict.reason}
          <br />
          <br />
          Your purchase is not lost. The agent is removed from the loop, you are not: complete it
          yourself below and your own UPI PIN authorizes the payment.
        </p>
      )}

      <div className="decision-actions">
        {gateway.kind === "order" && gateway.id ? (
          <>
            <span className="gateway-id">Razorpay order {gateway.id}</span>
            <span className={`gateway-mode gateway-mode-${gateway.mode}`}>{gateway.mode} mode</span>
          </>
        ) : null}

        {gateway.kind === "payment_link" && gateway.short_url ? (
          <>
            <a className="btn btn-warning" href={gateway.short_url} target="_blank" rel="noreferrer">
              Pay manually via payment link
            </a>
            <span className={`gateway-mode gateway-mode-${gateway.mode}`}>{gateway.mode} mode</span>
          </>
        ) : null}

        {gateway.kind === "none" ? (
          <span className="gateway-error">
            The gateway did not respond, so nothing was charged: {gateway.reason}
          </span>
        ) : null}
      </div>

      <div className="decision-foot">
        <span className="snapshot-hash" title={record.snapshot.snapshot_hash}>
          Snapshot {shortHash(record.snapshot.snapshot_hash)}
        </span>
        <AuditBadge entryHash={record.audit_entry.entry_hash} chainIntact />
      </div>
    </div>
  );
}

export function CheckoutView({ states, onBack, onComplete }: CheckoutViewProps) {
  const settled = states.every((s) => s.status !== "pending");
  const anyPassed = states.some((s) => s.record?.verdict.decision === "PASS");

  return (
    <section className="checkout">
      <button className="back" onClick={onBack} type="button">
        ← Back to store
      </button>

      <h1 className="checkout-title">Checkout</h1>
      <p className="checkout-sub">
        Each item is authorized on its own, so one held item never blocks the rest of your order.
      </p>

      {states.map((state) => {
        const { line, record } = state;

        return (
          <article className="checkout-card" key={line.product.sku}>
            <div className="checkout-item">
              <img className="checkout-image" src={line.product.image_url} alt="" />
              <div>
                <h2 className="checkout-name">{line.product.name}</h2>
                <p className="checkout-merchant">{line.product.merchant_id}</p>
                <p className="checkout-instruction">
                  <span>Authorized as</span> “{state.instruction}”
                </p>
              </div>
              <span className="checkout-price">
                {formatPaise(line.product.price_paise * line.qty)}
              </span>
            </div>

            {state.status === "error" ? (
              <p className="checkout-error">{state.error}</p>
            ) : (
              <VerificationPanel
                results={record?.verdict.results ?? []}
                pending={state.status === "pending"}
              />
            )}

            {record ? <Decision record={record} /> : null}
          </article>
        );
      })}

      {settled && anyPassed ? (
        <button className="btn btn-primary btn-block btn-lg" onClick={onComplete} type="button">
          Complete payment via Razorpay
        </button>
      ) : null}
    </section>
  );
}
