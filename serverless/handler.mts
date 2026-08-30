import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  createSnapshot,
  verify,
  DEFAULT_POLICY,
  type AuditEntry,
  type DraftOrder,
  type StateSnapshot,
  type Verdict,
} from "@mandate-shield/core";
import { MemoryAuditLedger } from "@mandate-shield/audit";
import { ShoppingAgent } from "@mandate-shield/agent";
import {
  PaymentGateway,
  parseWebhookEvent,
  verifyWebhookSignature,
} from "@mandate-shield/gateway";

/**
 * Serverless entry point.
 *
 * Runs the same deterministic core, the same agent, and the same gateway as
 * the long-running server. The one difference is the ledger: a serverless host
 * has no persistent disk, so the hash chain lives in memory and resets when an
 * instance is recycled. The health endpoint reports that plainly rather than
 * implying durability the deployment does not have.
 */

const ACTOR_SECRET = process.env.ACTOR_HMAC_SECRET?.trim() || "dev-only-change-me";

const agent = new ShoppingAgent({
  groqApiKey: process.env.GROQ_API_KEY?.trim() || undefined,
  model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
  actorSecret: ACTOR_SECRET,
});

const gateway = new PaymentGateway({
  keyId: process.env.RAZORPAY_KEY_ID?.trim() || undefined,
  keySecret: process.env.RAZORPAY_KEY_SECRET?.trim() || undefined,
});

// Module scope, so warm invocations of the same instance share the chain.
const ledger = new MemoryAuditLedger();
const records = new Map<string, TransactionRecord>();
const order: string[] = [];

interface TransactionRecord {
  transaction_id: string;
  instruction: string;
  created_at: string;
  snapshot: StateSnapshot;
  verdict: Verdict;
  gateway: Record<string, unknown>;
  audit_entry: AuditEntry;
}

async function settle(snapshot: StateSnapshot, verdict: Verdict): Promise<Record<string, unknown>> {
  const { amount_paise, currency } = snapshot.raw_payload_for_signing;

  try {
    if (verdict.decision === "PASS") {
      const created = await gateway.createOrder({
        amount_paise,
        currency,
        transaction_id: snapshot.transaction_id,
      });
      return { kind: "order", ...created };
    }

    const link = await gateway.createPaymentLink({
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

async function runTransaction(
  instruction: string,
  opts: { transactionId?: string; nonce?: string } = {},
): Promise<TransactionRecord> {
  const transactionId = opts.transactionId ?? randomUUID();
  const nonce = opts.nonce ?? randomUUID();
  const now = new Date().toISOString();

  const draft: DraftOrder = await agent.draftOrder(instruction, { transactionId, nonce });

  // Sealed once. Everything downstream reads this object.
  const snapshot = createSnapshot(draft, now);

  const verdict = verify(
    snapshot,
    { operation: "request_verification", now, ledger, actorHmacSecret: ACTOR_SECRET },
    DEFAULT_POLICY,
  );

  ledger.recordNonce(snapshot.nonce, transactionId, now);

  const gatewayResult = await settle(snapshot, verdict);

  const audit_entry = ledger.append({
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
    gateway: gatewayResult,
    audit_entry,
  };

  records.set(transactionId, record);
  order.push(transactionId);
  return record;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, x-razorpay-signature");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.replace(/^\/api/, "") || "/";

  try {
    if (path === "/health") {
      send(res, 200, {
        status: "ok",
        agent_mode: agent.mode,
        gateway_mode: gateway.mode,
        audit_chain: ledger.verifyChain(),
        // Stated rather than implied: this deployment's chain is per-instance.
        audit_persistence: "in-memory (serverless); history resets when the instance recycles",
      });
      return;
    }

    if (path === "/transactions" && req.method === "POST") {
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const instruction = body.instruction;

      if (typeof instruction !== "string" || instruction.trim() === "") {
        send(res, 400, { error: "A non-empty 'instruction' string is required." });
        return;
      }

      try {
        const record = await runTransaction(instruction, {
          transactionId: typeof body.transaction_id === "string" ? body.transaction_id : undefined,
          nonce: typeof body.nonce === "string" ? body.nonce : undefined,
        });
        send(res, 200, record);
      } catch (error) {
        send(res, 422, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (path === "/transactions" && req.method === "GET") {
      const recent = [...order].reverse().slice(0, 50).map((id) => records.get(id));
      send(res, 200, recent.filter(Boolean));
      return;
    }

    const single = path.match(/^\/transactions\/(.+)$/);
    if (single?.[1]) {
      const record = records.get(single[1]);
      if (!record) {
        send(res, 404, { error: `No transaction ${single[1]}` });
        return;
      }
      send(res, 200, record);
      return;
    }

    if (path === "/audit") {
      send(res, 200, { entries: ledger.list(100) });
      return;
    }

    if (path === "/audit/verify") {
      send(res, 200, ledger.verifyChain());
      return;
    }

    if (path === "/webhooks/razorpay" && req.method === "POST") {
      const raw = await readBody(req);
      const signature = String(req.headers["x-razorpay-signature"] ?? "");
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

      if (!secret || !verifyWebhookSignature(raw, signature, secret)) {
        send(res, 401, { error: "Invalid webhook signature." });
        return;
      }

      send(res, 200, { received: true, event: parseWebhookEvent(raw) });
      return;
    }

    send(res, 404, { error: `No route ${path}` });
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
