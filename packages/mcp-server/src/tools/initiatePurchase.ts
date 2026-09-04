import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../lib/context.js";
import { errorResult, formatPaise, jsonResult } from "../lib/format.js";
import { summarise } from "../lib/summarise.js";

const inputShape = {
  sku: z.string().describe("SKU of the product to buy, taken from a search_products result."),
  userInstruction: z
    .string()
    .describe(
      "What the user actually asked for, in their own words. This is the authorization record: " +
        "Mandate Shield reads it to decide which fields the user really stated. Do not embellish it, " +
        "and never add a budget or a merchant the user did not say.",
    ),
  sessionId: z.string().describe("sessionId returned by the search_products call that surfaced this SKU."),
  transactionId: z.string().optional().describe("Optional caller-supplied transaction id."),
};

export function registerInitiatePurchase(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "initiate_purchase",
    {
      title: "Initiate a verified purchase",
      description:
        "Draft an order for one SKU, seal it in a hashed snapshot, run all five Mandate Shield checks, " +
        "and settle it. A PASS creates a Razorpay order. A BLOCK does not lose the purchase: it returns a " +
        "payment link the human can complete themselves under normal UPI PIN authorization. Either way the " +
        "decision is appended to a hash-chained audit log.",
      inputSchema: inputShape,
    },
    async (args) => {
      const session = ctx.sessions.get(args.sessionId);
      if (!session) {
        return errorResult(
          `Unknown sessionId "${args.sessionId}". Call search_products first and pass the sessionId it returns.`,
        );
      }

      const product = ctx.catalog.find((candidate) => candidate.sku === args.sku);
      if (!product) {
        return errorResult(`No catalog product with SKU "${args.sku}".`);
      }

      if (!session.sku_results.includes(args.sku)) {
        // Provenance at the MCP boundary: a SKU that was never on screen was
        // never chosen by anyone.
        return errorResult(
          `SKU "${args.sku}" was not among the results of session ${args.sessionId}. ` +
            "Buy only a product the search actually returned.",
          { available: session.sku_results },
        );
      }

      const transactionId = args.transactionId ?? randomUUID();

      let record;
      try {
        record = await ctx.pipeline.process(args.userInstruction, {
          transactionId,
          nonce: randomUUID(),
          // Pin the draft to the SKU the client picked. Without this the agent
          // would re-search and could land on a different product than the one
          // the user was shown, which would make the snapshot describe
          // something nobody agreed to.
          catalog: [product],
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error), {
          hint:
            "The agent could not build a draft that satisfies the instruction. This usually means the " +
            "instruction states a budget below the product's price.",
        });
      }

      const { verdict, snapshot, gateway } = record;

      return jsonResult({
        transactionId: record.transaction_id,
        verdict: verdict.decision,
        failedChecks: verdict.failed_checks,
        reason: verdict.reason,
        summary: summarise(record),
        product: {
          sku: product.sku,
          name: product.name,
          merchantId: snapshot.raw_payload_for_signing.merchant_id,
        },
        amountPaise: snapshot.raw_payload_for_signing.amount_paise,
        amountFormatted: formatPaise(snapshot.raw_payload_for_signing.amount_paise),
        orderId: gateway.kind === "order" ? gateway.id : undefined,
        paymentUrl: gateway.kind === "payment_link" ? gateway.short_url : undefined,
        gatewayMode: gateway.kind === "none" ? undefined : gateway.mode,
        gatewayError: gateway.kind === "none" ? gateway.reason : undefined,
        checkResults: verdict.results.map((result) => ({
          check: result.check,
          passed: result.passed,
          reason: result.reason,
          threatIds: result.threat_ids,
        })),
        fieldProvenance: snapshot.field_provenance,
        snapshotHash: snapshot.snapshot_hash,
        auditEntryHash: record.audit_entry.entry_hash,
      });
    },
  );
}
