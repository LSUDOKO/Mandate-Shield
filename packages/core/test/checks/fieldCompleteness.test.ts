import { describe, it, expect } from "vitest";
import { fieldCompletenessCheck } from "../../src/checks/fieldCompleteness.js";
import { createSnapshot } from "../../src/snapshot.js";
import { DEFAULT_POLICY } from "../../src/policy.js";
import type { DraftOrder, FieldProvenance, SigningPayload } from "../../src/types.js";

function draft(
  provenance: FieldProvenance,
  payload: Partial<SigningPayload> = {},
  constraints: DraftOrder["user_intent"]["constraints"] = { max_amount_paise: 300000 },
): DraftOrder {
  const signing: SigningPayload = {
    merchant_id: "merchant_123",
    amount_paise: 289900,
    currency: "INR",
    ...payload,
  };
  return {
    transaction_id: "tx-1",
    nonce: "nonce-1",
    user_intent: {
      instruction: "buy running shoes from merchant_123, budget 3000 INR",
      explicit_fields: ["merchant_id", "max_amount", "currency"],
      constraints,
    },
    cart: {
      merchant_id: signing.merchant_id,
      items: [{ sku: "SHOE-042", name: "Trail Runner X", unit_price_paise: signing.amount_paise, qty: 1, source: "catalog" }],
      total_paise: signing.amount_paise,
      currency: signing.currency,
    },
    rendered_view: { display_total: "₹2,899.00", display_merchant: signing.merchant_id, display_items: [] },
    raw_payload_for_signing: signing,
    actor: { role: "shopping_agent", agent_id: "agent-1", signature: "sig" },
    field_provenance: provenance,
  };
}

const run = (d: DraftOrder) => fieldCompletenessCheck(createSnapshot(d, "2026-08-30T10:00:00.000Z"), DEFAULT_POLICY);

describe("fieldCompletenessCheck", () => {
  it("passes when every scope-affecting field traces to explicit user intent", () => {
    const result = run(draft({
      merchant_id: "user_explicit",
      amount_paise: "user_explicit",
      currency: "user_explicit",
    }));
    expect(result.passed).toBe(true);
    expect(result.threat_ids).toEqual(["T-6"]);
  });

  it("passes when currency comes from a pre-approved policy default", () => {
    const result = run(draft({
      merchant_id: "user_explicit",
      amount_paise: "user_explicit",
      currency: "policy_default",
    }));
    expect(result.passed).toBe(true);
  });

  it("blocks a merchant the agent silently invented", () => {
    const result = run(draft({
      merchant_id: "agent_inferred",
      amount_paise: "user_explicit",
      currency: "user_explicit",
    }));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/merchant_id/);
    expect(result.reason).toMatch(/agent_inferred/);
  });

  it("blocks a currency claimed as a policy default when policy does not pre-approve it", () => {
    const result = run(draft(
      { merchant_id: "user_explicit", amount_paise: "user_explicit", currency: "policy_default" },
      { currency: "USD" },
    ));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/USD/);
  });

  it("blocks when a scope-affecting field has no recorded provenance at all", () => {
    const result = run(draft({ merchant_id: "user_explicit", amount_paise: "user_explicit" }));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/currency/);
    expect(result.reason).toMatch(/no recorded authorization source/i);
  });

  it("blocks a merchant outside the policy allowlist even when marked explicit", () => {
    const result = run(draft(
      { merchant_id: "user_explicit", amount_paise: "user_explicit", currency: "user_explicit" },
      { merchant_id: "merchant_evil" },
    ));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/merchant_evil/);
  });

  it("blocks when the amount exceeds the user's stated ceiling", () => {
    const result = run(draft(
      { merchant_id: "user_explicit", amount_paise: "user_explicit", currency: "user_explicit" },
      { amount_paise: 400000 },
      { max_amount_paise: 300000 },
    ));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/exceeds/i);
  });

  it("blocks when the amount exceeds the policy per-transaction cap", () => {
    const result = run(draft(
      { merchant_id: "user_explicit", amount_paise: "user_explicit", currency: "user_explicit" },
      { amount_paise: 600000 },
      { max_amount_paise: 900000 },
    ));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/policy cap/i);
  });
});
