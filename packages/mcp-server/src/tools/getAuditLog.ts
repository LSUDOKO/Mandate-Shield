import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../lib/context.js";
import { jsonResult } from "../lib/format.js";
import { AUDIT_PERSISTENCE_NOTE } from "../lib/ledger.js";

const inputShape = {
  limit: z.number().int().positive().max(500).optional().describe("How many entries to return. Default 20."),
};

export function registerGetAuditLog(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_audit_log",
    {
      title: "Get the audit log",
      description:
        "Return recent Mandate Shield decisions, newest first, with the integrity status of the hash " +
        "chain. Each entry commits to the previous entry's hash, so editing any past decision breaks " +
        "the chain from that point on and verification reports where.",
      inputSchema: inputShape,
    },
    async (args) => {
      const limit = args.limit ?? 20;
      const entries = ctx.ledger.list(limit);
      const chain = ctx.ledger.verifyChain();

      return jsonResult({
        chain: {
          intact: chain.intact,
          brokenAtIndex: chain.brokenAtIndex,
          entryCount: chain.entryCount,
        },
        persistence: AUDIT_PERSISTENCE_NOTE,
        returned: entries.length,
        entries: entries.map((entry) => ({
          entryId: entry.entry_id,
          transactionId: entry.transaction_id,
          timestamp: entry.timestamp,
          decision: entry.decision,
          failedChecks: entry.failed_checks,
          reason: entry.reason,
          snapshotHash: entry.snapshot_hash,
          entryHash: entry.entry_hash,
          prevEntryHash: entry.prev_entry_hash,
        })),
      });
    },
  );
}
