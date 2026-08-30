import type { CheckResult, ReplayLedger, StateSnapshot } from "../types.js";

const CHECK = "replay_ledger";
const THREATS = ["replay"];

/**
 * In-memory ledger for tests and the benchmark. The server injects a
 * SQLite-backed implementation of the same interface.
 */
export class InMemoryReplayLedger implements ReplayLedger {
  private readonly seen = new Map<string, { transactionId: string; seenAt: string }>();

  hasNonce(nonce: string): boolean {
    return this.seen.has(nonce);
  }

  recordNonce(nonce: string, transactionId: string, seenAt: string): void {
    this.seen.set(nonce, { transactionId, seenAt });
  }
}

/**
 * Check 4 — Nonce replay.
 * If a nonce has been seen before, block immediately regardless of anything
 * else passing. The check only reads; recording happens once the transaction
 * reaches a verdict, so a rejected transaction cannot silently burn its nonce.
 */
export function replayCheck(snapshot: StateSnapshot, ledger: ReplayLedger): CheckResult {
  if (ledger.hasNonce(snapshot.nonce)) {
    return {
      check: CHECK,
      passed: false,
      reason: `Nonce ${snapshot.nonce} has already been processed. Replaying it would cause a duplicate charge.`,
      threat_ids: THREATS,
    };
  }

  return {
    check: CHECK,
    passed: true,
    reason: `Nonce ${snapshot.nonce} is unused.`,
    threat_ids: THREATS,
  };
}
