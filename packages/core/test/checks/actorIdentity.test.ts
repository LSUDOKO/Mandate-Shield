import { describe, it, expect } from "vitest";
import { actorIdentityCheck, signActorClaim, PERMISSION_MATRIX } from "../../src/checks/actorIdentity.js";
import { createSnapshot } from "../../src/snapshot.js";
import type { ActorClaim, DraftOrder } from "../../src/types.js";

const SECRET = "test-secret";

function draft(actor: ActorClaim): DraftOrder {
  return {
    transaction_id: "tx-1",
    nonce: "n1",
    user_intent: { instruction: "buy shoes", explicit_fields: [], constraints: {} },
    cart: {
      merchant_id: "merchant_123",
      items: [{ sku: "SHOE-042", name: "Trail Runner X", unit_price_paise: 289900, qty: 1, source: "catalog" }],
      total_paise: 289900,
      currency: "INR",
    },
    rendered_view: { display_total: "₹2,899.00", display_merchant: "merchant_123", display_items: [] },
    raw_payload_for_signing: { merchant_id: "merchant_123", amount_paise: 289900, currency: "INR" },
    actor,
    field_provenance: {},
  };
}

const snap = (actor: ActorClaim) => createSnapshot(draft(actor), "2026-08-30T10:00:00.000Z");

function validClaim(role: ActorClaim["role"], agentId = "agent-1"): ActorClaim {
  return { role, agent_id: agentId, signature: signActorClaim(role, agentId, "tx-1", SECRET) };
}

describe("PERMISSION_MATRIX", () => {
  it("grants each role only its own operations", () => {
    expect(PERMISSION_MATRIX.shopping_agent).toEqual(["create_draft_order", "request_verification"]);
    expect(PERMISSION_MATRIX.merchant_agent).toEqual(["submit_catalog", "confirm_fulfilment"]);
    expect(PERMISSION_MATRIX.credentials_provider).toEqual(["sign_mandate", "execute_payment"]);
  });
});

describe("actorIdentityCheck", () => {
  it("passes a correctly signed shopping agent requesting verification", () => {
    const result = actorIdentityCheck(snap(validClaim("shopping_agent")), "request_verification", SECRET);
    expect(result.passed).toBe(true);
    expect(result.threat_ids).toEqual(["T-29", "T-15"]);
  });

  it("blocks a merchant agent attempting an operation only the credentials provider may do", () => {
    const result = actorIdentityCheck(snap(validClaim("merchant_agent")), "sign_mandate", SECRET);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/merchant_agent/);
    expect(result.reason).toMatch(/sign_mandate/);
  });

  it("blocks a claim whose HMAC does not verify", () => {
    const result = actorIdentityCheck(
      snap({ role: "credentials_provider", agent_id: "agent-1", signature: "forged" }),
      "sign_mandate",
      SECRET,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/signature/i);
  });

  it("blocks a claim signed for a different transaction", () => {
    const signature = signActorClaim("shopping_agent", "agent-1", "tx-OTHER", SECRET);
    const result = actorIdentityCheck(
      snap({ role: "shopping_agent", agent_id: "agent-1", signature }),
      "request_verification",
      SECRET,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/signature/i);
  });

  it("blocks a role escalation where the signature was minted for a lower role", () => {
    const signature = signActorClaim("shopping_agent", "agent-1", "tx-1", SECRET);
    const result = actorIdentityCheck(
      snap({ role: "credentials_provider", agent_id: "agent-1", signature }),
      "sign_mandate",
      SECRET,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/signature/i);
  });

  it("blocks a missing signature", () => {
    const result = actorIdentityCheck(
      snap({ role: "shopping_agent", agent_id: "agent-1", signature: "" }),
      "request_verification",
      SECRET,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/missing/i);
  });

  it("blocks an unrecognised role", () => {
    const role = "rogue_role" as ActorClaim["role"];
    const result = actorIdentityCheck(
      snap({ role, agent_id: "agent-1", signature: signActorClaim(role, "agent-1", "tx-1", SECRET) }),
      "request_verification",
      SECRET,
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/unrecognised role|unknown role/i);
  });
});
