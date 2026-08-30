import { randomUUID } from "node:crypto";
import { createSnapshot, verify, DEFAULT_POLICY } from "@mandate-shield/core";
import type { AuditEntry, Policy, StateSnapshot, Verdict } from "@mandate-shield/core";
import type { ShoppingAgent } from "@mandate-shield/agent";
import type { PaymentGateway } from "@mandate-shield/gateway";
import type { DecisionLedger } from "@mandate-shield/audit";

export interface PipelineDeps {
  agent: ShoppingAgent;
  gateway: PaymentGateway;
  ledger: DecisionLedger;
  actorHmacSecret: string;
  policy?: Policy;
}

export type GatewayResult =
  | { kind: "order"; id: string; amount: number; currency: string; status: string; mode: string }
  | {
      kind: "payment_link";
      id: string;
      short_url: string;
      amount: number;
      currency: string;
      status: string;
      mode: string;
    }
  | { kind: "none"; reason: string };

export interface TransactionRecord {
  transaction_id: string;
  instruction: string;
  created_at: string;
  snapshot: StateSnapshot;
  verdict: Verdict;
  gateway: GatewayResult;
  audit_entry: AuditEntry;
}

/**
 * The full path: agent drafts, snapshot seals, verifier decides, gateway acts,
 * audit records.
 *
 * The snapshot is taken exactly once and every later stage reads it, so
 * nothing can re-fetch live state mid-flight — that is the TOCTOU fix in
 * practice rather than in theory.
 */
export class Pipeline {
  private readonly deps: PipelineDeps;
  private readonly records = new Map<string, TransactionRecord>();

  constructor(deps: PipelineDeps) {
    this.deps = deps;
  }

  async process(
    instruction: string,
    opts: { transactionId?: string; nonce?: string } = {},
  ): Promise<TransactionRecord> {
    const transactionId = opts.transactionId ?? randomUUID();
    const nonce = opts.nonce ?? randomUUID();
    const now = new Date().toISOString();

    const draft = await this.deps.agent.draftOrder(instruction, { transactionId, nonce });

    // Sealed here, once. Everything downstream reads this object.
    const snapshot = createSnapshot(draft, now);

    const verdict = verify(
      snapshot,
      {
        operation: "request_verification",
        now,
        ledger: this.deps.ledger,
        actorHmacSecret: this.deps.actorHmacSecret,
      },
      this.deps.policy ?? DEFAULT_POLICY,
    );

    // The nonce is spent once a verdict exists, pass or block, so nothing can
    // be quietly retried with the same nonce.
    this.deps.ledger.recordNonce(snapshot.nonce, transactionId, now);

    const gateway = await this.settle(snapshot, verdict);

    const audit_entry = this.deps.ledger.append({
      entry_id: randomUUID(),
      transaction_id: transactionId,
      timestamp: now,
      decision: verdict.decision,
      failed_checks: verdict.failed_checks,
      reason: verdict.reason,
      snapshot_hash: snapshot.snapshot_hash,
    });

    const record: TransactionRecord = {
      transaction_id: transactionId,
      instruction,
      created_at: now,
      snapshot,
      verdict,
      gateway,
      audit_entry,
    };

    this.records.set(transactionId, record);
    return record;
  }

  list(limit = 50): TransactionRecord[] {
    return [...this.records.values()].reverse().slice(0, limit);
  }

  get(transactionId: string): TransactionRecord | undefined {
    return this.records.get(transactionId);
  }

  /**
   * PASS creates a real order. BLOCK does not simply fail — it produces a
   * payment link so a human can still complete the purchase under normal UPI
   * PIN / OTP authorization. The agent is removed from the loop; the customer
   * is not.
   */
  private async settle(snapshot: StateSnapshot, verdict: Verdict): Promise<GatewayResult> {
    const { amount_paise, currency } = snapshot.raw_payload_for_signing;

    try {
      if (verdict.decision === "PASS") {
        const order = await this.deps.gateway.createOrder({
          amount_paise,
          currency,
          transaction_id: snapshot.transaction_id,
        });
        return { kind: "order", ...order };
      }

      const link = await this.deps.gateway.createPaymentLink({
        amount_paise,
        currency,
        transaction_id: snapshot.transaction_id,
        reason: verdict.failed_checks.join(", ") || verdict.reason,
      });
      return { kind: "payment_link", ...link };
    } catch (error) {
      // A gateway outage must never turn into a silent pass.
      return { kind: "none", reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
