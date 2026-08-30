import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, parseWebhookEvent } from "../src/webhookHandler.js";

const SECRET = "webhook-secret";
const body = JSON.stringify({
  event: "payment_link.paid",
  payload: {
    payment_link: { entity: { id: "plink_1", status: "paid", notes: { transaction_id: "tx-1" } } },
  },
});

describe("verifyWebhookSignature", () => {
  it("accepts a correctly computed signature", () => {
    const signature = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, SECRET)).toBe(true);
  });

  it("rejects a forged signature", () => {
    expect(verifyWebhookSignature(body, "deadbeef", SECRET)).toBe(false);
  });

  it("rejects a signature computed over different content", () => {
    const signature = createHmac("sha256", SECRET).update("{}").digest("hex");
    expect(verifyWebhookSignature(body, signature, SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const signature = createHmac("sha256", "other-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, SECRET)).toBe(false);
  });

  it("rejects when either the signature or the secret is missing", () => {
    expect(verifyWebhookSignature(body, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "abc", "")).toBe(false);
  });
});

describe("parseWebhookEvent", () => {
  it("extracts the transaction id and paid status from a payment link event", () => {
    expect(parseWebhookEvent(body)).toEqual({
      event: "payment_link.paid",
      transaction_id: "tx-1",
      payment_status: "paid",
      entity_id: "plink_1",
    });
  });

  it("extracts the same fields from an order paid event", () => {
    const orderBody = JSON.stringify({
      event: "order.paid",
      payload: { order: { entity: { id: "order_1", status: "paid", notes: { transaction_id: "tx-9" } } } },
    });
    expect(parseWebhookEvent(orderBody)).toEqual({
      event: "order.paid",
      transaction_id: "tx-9",
      payment_status: "paid",
      entity_id: "order_1",
    });
  });

  it("falls back to reference_id when notes carry no transaction id", () => {
    const refBody = JSON.stringify({
      event: "payment_link.paid",
      payload: { payment_link: { entity: { id: "plink_2", status: "paid", reference_id: "tx-ref" } } },
    });
    expect(parseWebhookEvent(refBody).transaction_id).toBe("tx-ref");
  });

  it("reports a failed payment as failed", () => {
    const failed = JSON.stringify({
      event: "payment_link.cancelled",
      payload: { payment_link: { entity: { id: "plink_3", status: "failed", notes: {} } } },
    });
    expect(parseWebhookEvent(failed).payment_status).toBe("failed");
  });

  it("reports unknown status for an unrecognised event", () => {
    const other = JSON.stringify({ event: "payment.failed", payload: {} });
    expect(parseWebhookEvent(other).payment_status).toBe("unknown");
  });

  it("survives malformed JSON without throwing", () => {
    expect(parseWebhookEvent("not json").payment_status).toBe("unknown");
  });
});
