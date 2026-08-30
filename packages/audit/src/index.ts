export { AuditLedger, GENESIS_HASH } from "./ledger.js";
export type { AppendInput, ChainResult } from "./ledger.js";
export { MemoryAuditLedger } from "./memoryLedger.js";

import type { AuditEntry } from "@mandate-shield/core";
import type { AppendInput, ChainResult } from "./ledger.js";

/**
 * What the server actually needs from a ledger. Both the SQLite-backed and
 * in-memory implementations satisfy it, so the pipeline does not care which
 * one it was handed.
 */
export interface DecisionLedger {
  append(input: AppendInput): AuditEntry;
  list(limit?: number): AuditEntry[];
  getByTransaction(transactionId: string): AuditEntry[];
  verifyChain(): ChainResult;
  hasNonce(nonce: string): boolean;
  recordNonce(nonce: string, transactionId: string, seenAt: string): void;
  close(): void;
}
