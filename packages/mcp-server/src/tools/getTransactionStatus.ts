import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../lib/context.js";
import { errorResult, formatPaise, jsonResult } from "../lib/format.js";
import { summarise } from "../lib/summarise.js";

const inputShape = {
  transactionId: z.string().describe("Transaction id returned by initiate_purchase."),
};

export function registerGetTransactionStatus(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_transaction_status",
    {
      title: "Get transaction status",
      description:
        "Look up a transaction this server processed: its verdict, every check result, the sealed " +
        "snapshot, the gateway outcome and its audit entry.",
      inputSchema: inputShape,
    },
    async (args) => {
      const record = ctx.pipeline.get(args.transactionId);

      if (!record) {
        return errorResult(
          `No transaction "${args.transactionId}" in this server's memory. ` +
            "Records live for the life of the MCP process and are lost when it restarts.",
        );
      }

      const { snapshot, verdict, gateway, audit_entry } = record;

      return jsonResult({
        transactionId: record.transaction_id,
        instruction: record.instruction,
        createdAt: record.created_at,
        verdict: verdict.decision,
        failedChecks: verdict.failed_checks,
        reason: verdict.reason,
        summary: summarise(record),
        checkResults: verdict.results.map((result) => ({
          check: result.check,
          passed: result.passed,
          reason: result.reason,
          threatIds: result.threat_ids,
        })),
        cart: {
          merchantId: snapshot.cart.merchant_id,
          currency: snapshot.cart.currency,
          totalPaise: snapshot.cart.total_paise,
          totalFormatted: formatPaise(snapshot.cart.total_paise),
          items: snapshot.cart.items.map((item) => ({
            sku: item.sku,
            name: item.name,
            qty: item.qty,
            unitPricePaise: item.unit_price_paise,
            unitPriceFormatted: formatPaise(item.unit_price_paise),
          })),
        },
        renderedView: snapshot.rendered_view,
        signingPayload: snapshot.raw_payload_for_signing,
        fieldProvenance: snapshot.field_provenance,
        actor: { role: snapshot.actor.role, agentId: snapshot.actor.agent_id },
        snapshotHash: snapshot.snapshot_hash,
        gateway,
        auditEntry: {
          entryId: audit_entry.entry_id,
          entryHash: audit_entry.entry_hash,
          prevEntryHash: audit_entry.prev_entry_hash,
          timestamp: audit_entry.timestamp,
        },
      });
    },
  );
}
