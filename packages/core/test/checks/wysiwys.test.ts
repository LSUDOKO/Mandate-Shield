import { describe, it, expect } from "vitest";
import { wysiwysCheck, parseDisplayAmountToPaise, formatPaiseAsDisplay } from "../../src/checks/wysiwys.js";
import { createSnapshot } from "../../src/snapshot.js";
import type { DraftOrder } from "../../src/types.js";

function draft(overrides: Partial<DraftOrder> = {}): DraftOrder {
  return {
    transaction_id: "tx-1",
    nonce: "nonce-1",
    user_intent: { instruction: "buy shoes", explicit_fields: ["max_amount"], constraints: {} },
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
    actor: { role: "shopping_agent", agent_id: "agent-1", signature: "sig" },
    field_provenance: {},
    ...overrides,
  };
}

const snap = (o: Partial<DraftOrder> = {}) => createSnapshot(draft(o), "2026-08-30T10:00:00.000Z");

describe("display amount parsing", () => {
  it("parses rupee strings into integer paise", () => {
    expect(parseDisplayAmountToPaise("₹2,899.00")).toBe(289900);
    expect(parseDisplayAmountToPaise("₹100")).toBe(10000);
    expect(parseDisplayAmountToPaise("Rs. 1,250.50")).toBe(125050);
  });

  it("returns null when there is no parseable amount", () => {
    expect(parseDisplayAmountToPaise("free")).toBeNull();
  });

  it("formats paise back into a rupee string", () => {
    expect(formatPaiseAsDisplay(289900)).toBe("₹2,899.00");
  });
});

describe("wysiwysCheck", () => {
  it("passes when the rendered view matches the signed payload exactly", () => {
    const result = wysiwysCheck(snap());
    expect(result.passed).toBe(true);
    expect(result.check).toBe("wysiwys");
    expect(result.threat_ids).toEqual(["T-7"]);
  });

  it("blocks when the displayed total is lower than the signed amount", () => {
    const result = wysiwysCheck(snap({
      raw_payload_for_signing: { merchant_id: "merchant_123", amount_paise: 589900, currency: "INR" },
      cart: { ...draft().cart, total_paise: 589900 },
    }));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/289900/);
    expect(result.reason).toMatch(/589900/);
  });

  it("blocks on a one-paise divergence", () => {
    const result = wysiwysCheck(snap({
      raw_payload_for_signing: { merchant_id: "merchant_123", amount_paise: 289901, currency: "INR" },
      cart: { ...draft().cart, total_paise: 289901 },
    }));
    expect(result.passed).toBe(false);
  });

  it("blocks when the displayed merchant differs from the signed merchant", () => {
    const result = wysiwysCheck(snap({
      rendered_view: { ...draft().rendered_view, display_merchant: "merchant_athleta" },
    }));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/merchant/i);
  });

  it("blocks when the cart total does not equal the signed amount", () => {
    const result = wysiwysCheck(snap({
      cart: { ...draft().cart, total_paise: 100000 },
    }));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/cart total/i);
  });

  it("blocks when the displayed total cannot be parsed at all", () => {
    const result = wysiwysCheck(snap({
      rendered_view: { ...draft().rendered_view, display_total: "see checkout" },
    }));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/could not be parsed/i);
  });

  it("blocks when item lines do not sum to the cart total", () => {
    const result = wysiwysCheck(snap({
      cart: {
        ...draft().cart,
        items: [{ sku: "SHOE-042", name: "Trail Runner X", unit_price_paise: 100000, qty: 1, source: "catalog" }],
      },
    }));
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/line items/i);
  });
});
