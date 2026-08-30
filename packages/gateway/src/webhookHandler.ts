import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookEvent {
  event: string;
  transaction_id: string | null;
  payment_status: "paid" | "failed" | "unknown";
  entity_id: string | null;
}

/**
 * Razorpay signs the raw request body, so verification must happen on the
 * bytes as received — before any parse or re-serialization.
 */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

/** Closes the loop: maps a callback back to the transaction that produced it. */
export function parseWebhookEvent(rawBody: string): WebhookEvent {
  const unknown: WebhookEvent = {
    event: "unknown",
    transaction_id: null,
    payment_status: "unknown",
    entity_id: null,
  };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return unknown;
  }

  const event = typeof body.event === "string" ? body.event : "unknown";
  const payload = (body.payload ?? {}) as Record<string, { entity?: Record<string, unknown> }>;
  const entity = payload.payment_link?.entity ?? payload.order?.entity ?? payload.payment?.entity;

  if (!entity) return { ...unknown, event };

  const notes = (entity.notes ?? {}) as Record<string, string>;
  const status = String(entity.status ?? "");

  return {
    event,
    transaction_id:
      notes.transaction_id ?? (typeof entity.reference_id === "string" ? entity.reference_id : null),
    payment_status:
      status === "paid" || status === "captured" ? "paid" : status === "failed" ? "failed" : "unknown",
    entity_id: typeof entity.id === "string" ? entity.id : null,
  };
}
