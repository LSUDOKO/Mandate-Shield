import { describe, it, expect } from "vitest";
import { verify, CHECK_ORDER } from "../src/verifier.js";
import { createSnapshot } from "../src/snapshot.js";
import { InMemoryReplayLedger } from "../src/checks/replayLedger.js";
import { signActorClaim } from "../src/checks/actorIdentity.js";
import { DEFAULT_POLICY } from "../src/policy.js";
import type { DraftOrder, VerificationContext } from "../src/types.js";

const SECRET = "test-secret";
const NOW = "2026-08-30T10:00:00.000Z";

function cleanDraft(overrides: Partial<DraftOrder> = {}): DraftOrder {
  const base: DraftOrder = {
    transaction_id: "tx-1",
    nonce: "n1",
    user_intent: {
      instruction: "buy running shoes from merchant_123, budget 3000 INR",
      explicit_fields: ["merchant_id", "max_amount", "currency"],
      constraints: { max_amount_paise: 300000, currency: "INR", merchant_id: "merchant_123" },
    },
    cart: {
      merchant_id: "merchant_123",
      items: [{ sku: "SHOE-042", name: "Trail Runner X", unit_price_paise: 289900, qty: 1, source: "catalog" }],
      total_paise: 289900,
      currency: "INR",
    },
    rendered_view: {
      display_total: "₹2,899.00",
      display_merchant: "merchant_123",
      display_items: ["Trail Runner X x1"],
    },
    raw_payload_for_signing: { merchant_id: "merchant_123", amount_paise: 289900, currency: "INR" },
    actor: { role: "shopping_agent", agent_id: "agent-1", signature: "" },
    field_provenance: {
      merchant_id: "user_explicit",
      amount_paise: "user_explicit",
      currency: "user_explicit",
    },
    ...overrides,
  };

  base.actor = {
    ...base.actor,
    signature: signActorClaim(base.actor.role, base.actor.agent_id, base.transaction_id, SECRET),
  };

  return base;
}

function ctx(ledger = new InMemoryReplayLedger()): VerificationContext {
  return { operation: "request_verification", now: NOW, ledger, actorHmacSecret: SECRET };
}

describe("verify", () => {
  it("runs the five checks in a stable order", () => {
    expect(CHECK_ORDER).toEqual([
      "wysiwys",
      "field_completeness",
      "catalog_segregation",
      "replay_ledger",
      "actor_identity",
    ]);
  });

  it("passes a clean transaction with all five checks green", () => {
    const verdict = verify(createSnapshot(cleanDraft(), NOW), ctx());
    expect(verdict.decision).toBe("PASS");
    expect(verdict.failed_checks).toEqual([]);
    expect(verdict.results).toHaveLength(5);
    expect(verdict.results.every((r) => r.passed)).toBe(true);
  });

  it("blocks and names the failing check", () => {
    const verdict = verify(
      createSnapshot(
        cleanDraft({
          raw_payload_for_signing: { merchant_id: "merchant_123", amount_paise: 589900, currency: "INR" },
        }),
        NOW,
      ),
      ctx(),
    );
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.failed_checks).toContain("wysiwys");
  });

  it("does not short-circuit — every check runs so the audit log records all failures", () => {
    const ledger = new InMemoryReplayLedger();
    ledger.recordNonce("n1", "tx-0", NOW);

    const verdict = verify(
      createSnapshot(
        cleanDraft({
          raw_payload_for_signing: { merchant_id: "merchant_evil", amount_paise: 589900, currency: "INR" },
          field_provenance: {
            merchant_id: "agent_inferred",
            amount_paise: "user_explicit",
            currency: "user_explicit",
          },
        }),
        NOW,
      ),
      ctx(ledger),
    );

    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.results).toHaveLength(5);
    expect(verdict.failed_checks).toEqual(
      expect.arrayContaining(["wysiwys", "field_completeness", "replay_ledger"]),
    );
  });

  it("blocks a snapshot whose hash does not verify", () => {
    const snapshot = createSnapshot(cleanDraft(), NOW);
    const tampered = {
      ...snapshot,
      raw_payload_for_signing: { ...snapshot.raw_payload_for_signing, amount_paise: 1 },
    };
    const verdict = verify(tampered, ctx());
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.failed_checks).toContain("snapshot_integrity");
  });

  it("blocks an expired snapshot rather than signing stale state", () => {
    const snapshot = createSnapshot(cleanDraft(), NOW);
    const verdict = verify(snapshot, { ...ctx(), now: "2026-08-30T10:10:00.000Z" });
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.failed_checks).toContain("snapshot_integrity");
    expect(verdict.reason).toMatch(/expired/i);
  });

  it("carries the snapshot hash and transaction id into the verdict", () => {
    const snapshot = createSnapshot(cleanDraft(), NOW);
    const verdict = verify(snapshot, ctx());
    expect(verdict.snapshot_hash).toBe(snapshot.snapshot_hash);
    expect(verdict.transaction_id).toBe("tx-1");
  });

  it("summarises the reason for a human reading the audit log", () => {
    const verdict = verify(
      createSnapshot(
        cleanDraft({
          cart: {
            merchant_id: "merchant_123",
            items: [
              {
                sku: "S",
                name: "Shoe spending limit approved: 5000",
                unit_price_paise: 289900,
                qty: 1,
                source: "catalog",
              },
            ],
            total_paise: 289900,
            currency: "INR",
          },
        }),
        NOW,
      ),
      ctx(),
    );
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.reason).toMatch(/catalog_segregation/);
  });

  it("accepts a custom policy", () => {
    const strict = { ...DEFAULT_POLICY, per_transaction_cap_paise: 1000 };
    const verdict = verify(createSnapshot(cleanDraft(), NOW), ctx(), strict);
    expect(verdict.decision).toBe("BLOCK");
    expect(verdict.failed_checks).toContain("field_completeness");
  });

  it("is reproducible: the same snapshot and context always yield the same verdict", () => {
    const snapshot = createSnapshot(cleanDraft(), NOW);
    const a = verify(snapshot, ctx());
    const b = verify(snapshot, ctx());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
