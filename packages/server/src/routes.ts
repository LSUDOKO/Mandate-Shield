import { Router, type Request, type Response } from "express";
import { parseWebhookEvent, verifyWebhookSignature } from "@mandate-shield/gateway";
import type { AuditLedger } from "@mandate-shield/audit";
import type { Pipeline } from "./pipeline.js";

export interface RouteDeps {
  pipeline: Pipeline;
  ledger: AuditLedger;
  webhookSecret?: string;
  agentMode: "groq" | "offline";
  gatewayMode: "live" | "mock";
}

export function createRoutes(deps: RouteDeps): Router {
  const router = Router();

  /** Reports which components are live and which are running offline. */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      agent_mode: deps.agentMode,
      gateway_mode: deps.gatewayMode,
      audit_chain: deps.ledger.verifyChain(),
    });
  });

  router.post("/transactions", async (req: Request, res: Response) => {
    const { instruction, transaction_id, nonce } = req.body ?? {};

    if (typeof instruction !== "string" || instruction.trim() === "") {
      res.status(400).json({ error: "A non-empty 'instruction' string is required." });
      return;
    }

    try {
      const record = await deps.pipeline.process(instruction, { transactionId: transaction_id, nonce });
      res.json(record);
    } catch (error) {
      // The agent could not build a draft at all (nothing in the catalog fits).
      // That is a problem with the request, not a server fault.
      res.status(422).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/transactions", (req: Request, res: Response) => {
    const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
    res.json(deps.pipeline.list(Number.isFinite(limit) ? limit : 50));
  });

  router.get("/transactions/:id", (req: Request, res: Response) => {
    const record = deps.pipeline.get(req.params.id as string);

    if (!record) {
      res.status(404).json({ error: `No transaction ${req.params.id}` });
      return;
    }

    res.json(record);
  });

  router.get("/audit", (req: Request, res: Response) => {
    const limit = Number.parseInt(String(req.query.limit ?? "100"), 10);
    res.json({ entries: deps.ledger.list(Number.isFinite(limit) ? limit : 100) });
  });

  router.get("/audit/verify", (_req: Request, res: Response) => {
    res.json(deps.ledger.verifyChain());
  });

  router.post("/webhooks/razorpay", (req: Request, res: Response) => {
    const signature = req.header("x-razorpay-signature") ?? "";
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    if (!deps.webhookSecret || !verifyWebhookSignature(raw, signature, deps.webhookSecret)) {
      res.status(401).json({ error: "Invalid webhook signature." });
      return;
    }

    res.json({ received: true, event: parseWebhookEvent(raw) });
  });

  return router;
}
