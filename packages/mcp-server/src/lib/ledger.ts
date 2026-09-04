import { MemoryAuditLedger } from "@mandate-shield/audit";
import type { DecisionLedger } from "@mandate-shield/audit";

/**
 * Hash-chained audit ledger, held in memory.
 *
 * The MCP server is a per-client process that Claude Desktop starts and stops,
 * so there is no long-lived disk to chain onto and the SQLite ledger would add
 * a native binding to a process that must start instantly. Tamper-evidence is
 * real for the life of the process; durability across restarts is not, and the
 * get_audit_log tool says so rather than implying otherwise.
 */
export function createLedger(): DecisionLedger {
  return new MemoryAuditLedger();
}

export const AUDIT_PERSISTENCE_NOTE =
  "in-memory (per MCP process); history resets when the server restarts";
