import { describe, it, expect } from "vitest";
import { replayCheck, InMemoryReplayLedger } from "../../src/checks/replayLedger.js";
import { createSnapshot } from "../../src/snapshot.js";
import type { DraftOrder } from "../../src/types.js";

function draft(transactionId: string, nonce: string): DraftOrder {
  return {
    transaction_id: transactionId,
    nonce,
    user_intent: { instruction: "buy shoes", explicit_fields: [], constraints: {} },
    cart: {
      merchant_id: "merchant_123",
      items: [{ sku: "SHOE-042", name: "Trail Runner X", unit_price_paise: 289900, qty: 1, source: "catalog" }],
      total_paise: 289900,
      currency: "INR",
    },
    rendered_view: { display_total: "₹2,899.00", display_merchant: "merchant_123", display_items: [] },
    raw_payload_for_signing: { merchant_id: "merchant_123", amount_paise: 289900, currency: "INR" },
    actor: { role: "shopping_agent", agent_id: "agent-1", signature: "sig" },
    field_provenance: {},
  };
}

const snap = (tx: string, nonce: string) => createSnapshot(draft(tx, nonce), "2026-08-30T10:00:00.000Z");

describe("InMemoryReplayLedger", () => {
  it("reports a nonce only after it has been recorded", () => {
    const ledger = new InMemoryReplayLedger();
    expect(ledger.hasNonce("n1")).toBe(false);
    ledger.recordNonce("n1", "tx-1", "2026-08-30T10:00:00.000Z");
    expect(ledger.hasNonce("n1")).toBe(true);
  });

  it("keeps distinct nonces independent", () => {
    const ledger = new InMemoryReplayLedger();
    ledger.recordNonce("n1", "tx-1", "2026-08-30T10:00:00.000Z");
    expect(ledger.hasNonce("n2")).toBe(false);
  });
});

describe("replayCheck", () => {
  it("passes the first time a nonce is seen", () => {
    const ledger = new InMemoryReplayLedger();
    const result = replayCheck(snap("tx-1", "n1"), ledger);
    expect(result.passed).toBe(true);
    expect(result.check).toBe("replay_ledger");
    expect(result.threat_ids).toEqual(["replay"]);
  });

  it("blocks a nonce that was already recorded", () => {
    const ledger = new InMemoryReplayLedger();
    ledger.recordNonce("n1", "tx-1", "2026-08-30T10:00:00.000Z");
    const result = replayCheck(snap("tx-2", "n1"), ledger);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/n1/);
    expect(result.reason).toMatch(/already/i);
  });

  it("does not record the nonce itself — recording is the caller's job", () => {
    const ledger = new InMemoryReplayLedger();
    replayCheck(snap("tx-1", "n1"), ledger);
    expect(ledger.hasNonce("n1")).toBe(false);
  });

  it("blocks a resubmission of the identical transaction", () => {
    const ledger = new InMemoryReplayLedger();
    const first = snap("tx-1", "n1");
    expect(replayCheck(first, ledger).passed).toBe(true);
    ledger.recordNonce(first.nonce, first.transaction_id, "2026-08-30T10:00:00.000Z");
    expect(replayCheck(first, ledger).passed).toBe(false);
  });
});
