import { describe, it, expect, beforeEach } from "vitest";
import { MemoryAuditLedger } from "../src/memoryLedger.js";
import { GENESIS_HASH, type AppendInput } from "../src/ledger.js";

/**
 * The in-memory ledger backs serverless deployments. Its chaining must behave
 * exactly like the SQLite one, because it is the same tamper-evidence claim.
 */
let ledger: MemoryAuditLedger;
let counter = 0;

function append(overrides: Partial<AppendInput> = {}) {
  counter += 1;
  return ledger.append({
    entry_id: `entry-${counter}`,
    transaction_id: `tx-${counter}`,
    timestamp: `2026-08-30T10:0${counter}:00.000Z`,
    decision: "PASS",
    failed_checks: [],
    reason: "all checks passed",
    snapshot_hash: `sha256:${"a".repeat(64)}`,
    ...overrides,
  });
}

beforeEach(() => {
  counter = 0;
  ledger = new MemoryAuditLedger();
});

describe("MemoryAuditLedger", () => {
  it("chains the first entry to the genesis hash", () => {
    expect(append().prev_entry_hash).toBe(GENESIS_HASH);
  });

  it("chains each entry to the previous entry's hash", () => {
    const first = append();
    expect(append().prev_entry_hash).toBe(first.entry_hash);
  });

  it("reports an intact chain when nothing was tampered with", () => {
    append();
    append();
    append();
    expect(ledger.verifyChain()).toEqual({ intact: true, brokenAtIndex: null, entryCount: 3 });
  });

  it("detects tampering with a past entry", () => {
    append();
    append();
    append();
    ledger.rawUpdateForTesting("entry-2", { reason: "silently edited" });
    expect(ledger.verifyChain()).toMatchObject({ intact: false, brokenAtIndex: 1 });
  });

  it("detects a flipped decision", () => {
    append({ decision: "BLOCK", failed_checks: ["wysiwys"], reason: "blocked" });
    append();
    ledger.rawUpdateForTesting("entry-1", { decision: "PASS" });
    expect(ledger.verifyChain().intact).toBe(false);
  });

  it("lists newest first and honours the limit", () => {
    append();
    append();
    append();
    const entries = ledger.list(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.entry_id).toBe("entry-3");
  });

  it("finds every entry for a transaction", () => {
    append({ transaction_id: "tx-shared" });
    append({ transaction_id: "tx-shared", decision: "BLOCK", failed_checks: ["replay_ledger"], reason: "replay" });
    expect(ledger.getByTransaction("tx-shared")).toHaveLength(2);
  });

  it("reports an empty chain as intact", () => {
    expect(ledger.verifyChain()).toEqual({ intact: true, brokenAtIndex: null, entryCount: 0 });
  });

  it("tracks nonces so Check 4 works the same way", () => {
    expect(ledger.hasNonce("n1")).toBe(false);
    ledger.recordNonce("n1", "tx-1", "2026-08-30T10:00:00.000Z");
    expect(ledger.hasNonce("n1")).toBe(true);
    expect(() => ledger.recordNonce("n1", "tx-2", "2026-08-30T10:01:00.000Z")).not.toThrow();
  });
});
