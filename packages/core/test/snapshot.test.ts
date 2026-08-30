import { describe, it, expect } from "vitest";
import { canonicalize, hashObject } from "../src/canonical.js";
import { createSnapshot, verifySnapshotHash, isSnapshotExpired } from "../src/snapshot.js";
import type { DraftOrder } from "../src/types.js";

const draft: DraftOrder = {
  transaction_id: "tx-1",
  nonce: "nonce-1",
  user_intent: {
    instruction: "buy running shoes, budget 3000 INR",
    explicit_fields: ["item_category", "max_amount", "currency"],
    constraints: { max_amount_paise: 300000, currency: "INR", item_category: "footwear" },
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
  actor: { role: "shopping_agent", agent_id: "agent-1", signature: "sig" },
  field_provenance: {
    merchant_id: "user_explicit",
    amount_paise: "user_explicit",
    currency: "user_explicit",
  },
};

describe("canonicalize", () => {
  it("sorts keys recursively so equal content hashes equally", () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(hashObject({ b: 1, a: 2 })).toBe(hashObject({ a: 2, b: 1 }));
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("prefixes hashes with sha256:", () => {
    expect(hashObject({ a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("createSnapshot", () => {
  it("carries the draft's content and a verifiable hash", () => {
    const snap = createSnapshot(draft, "2026-08-30T10:00:00.000Z");
    expect(snap.transaction_id).toBe("tx-1");
    expect(snap.raw_payload_for_signing.amount_paise).toBe(289900);
    expect(snap.created_at).toBe("2026-08-30T10:00:00.000Z");
    expect(verifySnapshotHash(snap)).toBe(true);
  });

  it("is deep-frozen so no upstream change can mutate it", () => {
    const snap = createSnapshot(draft, "2026-08-30T10:00:00.000Z");
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.raw_payload_for_signing)).toBe(true);
    expect(Object.isFrozen(snap.cart.items[0])).toBe(true);
    expect(() => {
      (snap.raw_payload_for_signing as { amount_paise: number }).amount_paise = 999999;
    }).toThrow();
  });

  it("detects tampering after creation", () => {
    const snap = createSnapshot(draft, "2026-08-30T10:00:00.000Z");
    const tampered = {
      ...snap,
      raw_payload_for_signing: { ...snap.raw_payload_for_signing, amount_paise: 999999 },
    };
    expect(verifySnapshotHash(tampered)).toBe(false);
  });

  it("gives different content different hashes", () => {
    const a = createSnapshot(draft, "2026-08-30T10:00:00.000Z");
    const b = createSnapshot({ ...draft, transaction_id: "tx-2" }, "2026-08-30T10:00:00.000Z");
    expect(a.snapshot_hash).not.toBe(b.snapshot_hash);
  });

  it("does not alias the draft, so later draft mutation cannot leak in", () => {
    const mutable = structuredClone(draft);
    const snap = createSnapshot(mutable, "2026-08-30T10:00:00.000Z");
    mutable.raw_payload_for_signing.amount_paise = 999999;
    expect(snap.raw_payload_for_signing.amount_paise).toBe(289900);
    expect(verifySnapshotHash(snap)).toBe(true);
  });
});

describe("isSnapshotExpired", () => {
  const snap = createSnapshot(draft, "2026-08-30T10:00:00.000Z");

  it("is fresh inside the TTL", () => {
    expect(isSnapshotExpired(snap, "2026-08-30T10:04:00.000Z", 300)).toBe(false);
  });

  it("is expired past the TTL", () => {
    expect(isSnapshotExpired(snap, "2026-08-30T10:06:00.000Z", 300)).toBe(true);
  });
});
