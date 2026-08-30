import { hashObject } from "@mandate-shield/core";
import type { AuditEntry, ReplayLedger } from "@mandate-shield/core";
import { GENESIS_HASH, type AppendInput, type ChainResult } from "./ledger.js";

/**
 * The same hash-chained ledger, held in memory.
 *
 * Exists for serverless hosts, which have no persistent disk and cannot load a
 * native SQLite binding. The chaining and verification logic is identical to
 * AuditLedger, so the tamper-evidence property is real within an instance's
 * lifetime; what it loses is durability across cold starts. Anything relying on
 * that difference should say so where a reader can see it.
 */

/** The content each entry_hash covers, including the previous entry's hash. */
function chainContent(entry: Omit<AuditEntry, "entry_hash">) {
  return {
    entry_id: entry.entry_id,
    transaction_id: entry.transaction_id,
    timestamp: entry.timestamp,
    decision: entry.decision,
    failed_checks: entry.failed_checks,
    reason: entry.reason,
    snapshot_hash: entry.snapshot_hash,
    prev_entry_hash: entry.prev_entry_hash,
  };
}

export class MemoryAuditLedger implements ReplayLedger {
  private readonly entries: AuditEntry[] = [];
  private readonly nonces = new Map<string, { transactionId: string; seenAt: string }>();

  append(input: AppendInput): AuditEntry {
    const prev = this.entries[this.entries.length - 1];
    const withoutHash = { ...input, prev_entry_hash: prev?.entry_hash ?? GENESIS_HASH };
    const entry: AuditEntry = { ...withoutHash, entry_hash: hashObject(chainContent(withoutHash)) };

    this.entries.push(entry);
    return entry;
  }

  /** Newest first, matching AuditLedger. */
  list(limit = 100): AuditEntry[] {
    return [...this.entries].reverse().slice(0, limit);
  }

  getByTransaction(transactionId: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.transaction_id === transactionId);
  }

  verifyChain(): ChainResult {
    let expectedPrev = GENESIS_HASH;

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i] as AuditEntry;

      if (entry.prev_entry_hash !== expectedPrev) {
        return { intact: false, brokenAtIndex: i, entryCount: this.entries.length };
      }

      if (hashObject(chainContent(entry)) !== entry.entry_hash) {
        return { intact: false, brokenAtIndex: i, entryCount: this.entries.length };
      }

      expectedPrev = entry.entry_hash;
    }

    return { intact: true, brokenAtIndex: null, entryCount: this.entries.length };
  }

  hasNonce(nonce: string): boolean {
    return this.nonces.has(nonce);
  }

  recordNonce(nonce: string, transactionId: string, seenAt: string): void {
    if (!this.nonces.has(nonce)) this.nonces.set(nonce, { transactionId, seenAt });
  }

  /** Test-only: simulates an attacker editing a stored entry in place. */
  rawUpdateForTesting(entryId: string, fields: Partial<Pick<AuditEntry, "reason" | "decision">>): void {
    const entry = this.entries.find((candidate) => candidate.entry_id === entryId);
    if (!entry) return;
    if (fields.reason !== undefined) entry.reason = fields.reason;
    if (fields.decision !== undefined) entry.decision = fields.decision;
  }

  close(): void {
    // Nothing to release.
  }
}
