import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditLedger, GENESIS_HASH, type AppendInput } from "../src/ledger.js";

let ledger: AuditLedger;
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
  ledger = new AuditLedger(":memory:");
});

afterEach(() => ledger.close());

describe("AuditLedger", () => {
  it("chains the first entry to the genesis hash", () => {
    const entry = append();
    expect(entry.prev_entry_hash).toBe(GENESIS_HASH);
    expect(entry.entry_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("chains each entry to the previous entry's hash", () => {
    const first = append();
    const second = append();
    expect(second.prev_entry_hash).toBe(first.entry_hash);
  });

  it("records both PASS and BLOCK decisions with their reasons", () => {
    append({ decision: "BLOCK", failed_checks: ["wysiwys"], reason: "divergence" });
    const [entry] = ledger.list();
    expect(entry?.decision).toBe("BLOCK");
    expect(entry?.failed_checks).toEqual(["wysiwys"]);
    expect(entry?.reason).toBe("divergence");
  });

  it("returns an intact chain when nothing was tampered with", () => {
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
    const result = ledger.verifyChain();
    expect(result.intact).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
  });

  it("detects a flipped decision, the most consequential tamper", () => {
    append({ decision: "BLOCK", failed_checks: ["wysiwys"], reason: "blocked" });
    append();
    ledger.rawUpdateForTesting("entry-1", { decision: "PASS" });
    expect(ledger.verifyChain().intact).toBe(false);
  });

  it("lists entries newest first and honours the limit", () => {
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
});

describe("AuditLedger as a ReplayLedger", () => {
  it("reports a nonce only after recording it", () => {
    expect(ledger.hasNonce("n1")).toBe(false);
    ledger.recordNonce("n1", "tx-1", "2026-08-30T10:00:00.000Z");
    expect(ledger.hasNonce("n1")).toBe(true);
  });

  it("ignores a duplicate record instead of throwing", () => {
    ledger.recordNonce("n1", "tx-1", "2026-08-30T10:00:00.000Z");
    expect(() => ledger.recordNonce("n1", "tx-2", "2026-08-30T10:01:00.000Z")).not.toThrow();
    expect(ledger.hasNonce("n1")).toBe(true);
  });

  it("keeps distinct nonces independent", () => {
    ledger.recordNonce("n1", "tx-1", "2026-08-30T10:00:00.000Z");
    expect(ledger.hasNonce("n2")).toBe(false);
  });
});
