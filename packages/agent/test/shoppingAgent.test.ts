import { describe, it, expect } from "vitest";
import { ShoppingAgent } from "../src/shoppingAgent.js";
import { signActorClaim } from "@mandate-shield/core";

const SECRET = "test-secret";
const ids = { transactionId: "tx-1", nonce: "n1" };

function agent() {
  return new ShoppingAgent({ actorSecret: SECRET, agentId: "agent-1" });
}

describe("ShoppingAgent (offline mode)", () => {
  it("runs offline when no Groq key is supplied", () => {
    expect(agent().mode).toBe("offline");
  });

  it("produces a draft whose cart total matches the signing payload", async () => {
    const draft = await agent().draftOrder("buy running shoes, budget 3000 INR", ids);
    expect(draft.cart.total_paise).toBe(draft.raw_payload_for_signing.amount_paise);
    expect(draft.cart.items.length).toBeGreaterThan(0);
  });

  it("renders a display total that matches the signed amount", async () => {
    const draft = await agent().draftOrder("buy running shoes, budget 3000 INR", ids);
    const digits = draft.rendered_view.display_total.replace(/[^\d.]/g, "");
    expect(Math.round(Number.parseFloat(digits) * 100)).toBe(draft.raw_payload_for_signing.amount_paise);
  });

  it("signs a valid actor claim bound to the transaction", async () => {
    const draft = await agent().draftOrder("buy running shoes, budget 3000 INR", ids);
    expect(draft.actor.role).toBe("shopping_agent");
    expect(draft.actor.signature).toBe(signActorClaim("shopping_agent", "agent-1", "tx-1", SECRET));
  });

  it("records honest provenance: an unnamed merchant is agent_inferred, not explicit", async () => {
    const draft = await agent().draftOrder("buy running shoes, budget 3000", ids);
    expect(draft.field_provenance.merchant_id).toBe("agent_inferred");
  });

  it("records a user-named merchant as explicit", async () => {
    const draft = await agent().draftOrder("buy a tee from merchant_athleta under 1000 INR", ids);
    expect(draft.field_provenance.merchant_id).toBe("user_explicit");
  });

  it("records currency as a policy default when the user did not state one", async () => {
    const draft = await agent().draftOrder("buy running shoes under 3000", ids);
    expect(draft.field_provenance.currency).toBe("policy_default");
  });

  it("marks every cart item as catalog-sourced", async () => {
    const draft = await agent().draftOrder("buy running shoes, budget 3000 INR", ids);
    expect(draft.cart.items.every((i) => i.source === "catalog")).toBe(true);
  });

  it("carries the ids it was given", async () => {
    const draft = await agent().draftOrder("buy running shoes, budget 3000 INR", ids);
    expect(draft.transaction_id).toBe("tx-1");
    expect(draft.nonce).toBe("n1");
  });

  it("throws when the catalog has nothing within budget", async () => {
    await expect(agent().draftOrder("buy running shoes, budget 5 INR", ids)).rejects.toThrow(/no catalog item/i);
  });
});
