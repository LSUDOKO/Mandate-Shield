import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashObject } from "@mandate-shield/core";
import type { AuditEntry, ReplayLedger } from "@mandate-shield/core";

/** The chain's anchor. Nothing precedes the first entry. */
export const GENESIS_HASH = `sha256:${"0".repeat(64)}`;

export interface AppendInput {
  entry_id: string;
  transaction_id: string;
  timestamp: string;
  decision: "PASS" | "BLOCK";
  failed_checks: string[];
  reason: string;
  snapshot_hash: string;
}

export interface ChainResult {
  intact: boolean;
  brokenAtIndex: number | null;
  entryCount: number;
}

interface Row {
  entry_id: string;
  transaction_id: string;
  timestamp: string;
  decision: "PASS" | "BLOCK";
  failed_checks: string;
  reason: string;
  snapshot_hash: string;
  prev_entry_hash: string;
  entry_hash: string;
}

function rowToEntry(row: Row): AuditEntry {
  return { ...row, failed_checks: JSON.parse(row.failed_checks) as string[] };
}

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

/**
 * Append-only, tamper-evident decision log.
 *
 * Also serves as the persistent nonce store backing Check 4, so it satisfies
 * core's ReplayLedger interface and can be injected straight into a
 * VerificationContext.
 */
export class AuditLedger implements ReplayLedger {
  private readonly db: Database.Database;

  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
    this.db.exec(readFileSync(schemaPath, "utf8"));
  }

  append(input: AppendInput): AuditEntry {
    const prev = this.db
      .prepare("SELECT entry_hash FROM audit_entries ORDER BY seq DESC LIMIT 1")
      .get() as { entry_hash: string } | undefined;

    const withoutHash = { ...input, prev_entry_hash: prev?.entry_hash ?? GENESIS_HASH };
    const entry: AuditEntry = { ...withoutHash, entry_hash: hashObject(chainContent(withoutHash)) };

    this.db
      .prepare(
        `INSERT INTO audit_entries
         (entry_id, transaction_id, timestamp, decision, failed_checks, reason, snapshot_hash, prev_entry_hash, entry_hash)
         VALUES (@entry_id, @transaction_id, @timestamp, @decision, @failed_checks, @reason, @snapshot_hash, @prev_entry_hash, @entry_hash)`,
      )
      .run({ ...entry, failed_checks: JSON.stringify(entry.failed_checks) });

    return entry;
  }

  /** Newest first. */
  list(limit = 100): AuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_entries ORDER BY seq DESC LIMIT ?")
      .all(limit) as Row[];
    return rows.map(rowToEntry);
  }

  getByTransaction(transactionId: string): AuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_entries WHERE transaction_id = ? ORDER BY seq ASC")
      .all(transactionId) as Row[];
    return rows.map(rowToEntry);
  }

  /**
   * Walks the chain in insertion order. Returns the index of the first entry
   * whose recorded hash disagrees with its recomputed hash, or whose link to
   * the previous entry is broken.
   */
  verifyChain(): ChainResult {
    const rows = this.db.prepare("SELECT * FROM audit_entries ORDER BY seq ASC").all() as Row[];
    let expectedPrev = GENESIS_HASH;

    for (let i = 0; i < rows.length; i += 1) {
      const entry = rowToEntry(rows[i] as Row);

      if (entry.prev_entry_hash !== expectedPrev) {
        return { intact: false, brokenAtIndex: i, entryCount: rows.length };
      }

      if (hashObject(chainContent(entry)) !== entry.entry_hash) {
        return { intact: false, brokenAtIndex: i, entryCount: rows.length };
      }

      expectedPrev = entry.entry_hash;
    }

    return { intact: true, brokenAtIndex: null, entryCount: rows.length };
  }

  hasNonce(nonce: string): boolean {
    return this.db.prepare("SELECT 1 FROM nonces WHERE nonce = ?").get(nonce) !== undefined;
  }

  recordNonce(nonce: string, transactionId: string, seenAt: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO nonces (nonce, transaction_id, seen_at) VALUES (?, ?, ?)")
      .run(nonce, transactionId, seenAt);
  }

  /** Test-only: simulates an attacker editing a stored row in place. */
  rawUpdateForTesting(entryId: string, fields: Partial<Pick<AuditEntry, "reason" | "decision">>): void {
    if (fields.reason !== undefined) {
      this.db.prepare("UPDATE audit_entries SET reason = ? WHERE entry_id = ?").run(fields.reason, entryId);
    }
    if (fields.decision !== undefined) {
      this.db.prepare("UPDATE audit_entries SET decision = ? WHERE entry_id = ?").run(fields.decision, entryId);
    }
  }

  close(): void {
    this.db.close();
  }
}
