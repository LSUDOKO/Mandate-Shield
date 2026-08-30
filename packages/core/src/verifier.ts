import { wysiwysCheck } from "./checks/wysiwys.js";
import { fieldCompletenessCheck } from "./checks/fieldCompleteness.js";
import { catalogSegregationCheck } from "./checks/catalogSegregation.js";
import { replayCheck } from "./checks/replayLedger.js";
import { actorIdentityCheck } from "./checks/actorIdentity.js";
import { isSnapshotExpired, verifySnapshotHash } from "./snapshot.js";
import { DEFAULT_POLICY, type Policy } from "./policy.js";
import type { CheckResult, StateSnapshot, VerificationContext, Verdict } from "./types.js";

export const CHECK_ORDER = [
  "wysiwys",
  "field_completeness",
  "catalog_segregation",
  "replay_ledger",
  "actor_identity",
] as const;

function summarise(results: CheckResult[]): string {
  const failed = results.filter((r) => !r.passed);

  if (failed.length === 0) {
    return `All ${results.length} checks passed. Transaction matches user intent and is safe to sign.`;
  }

  return failed.map((r) => `${r.check}: ${r.reason}`).join(" | ");
}

/**
 * Orchestrates all five deterministic checks.
 *
 * Every check runs even after one fails, so the audit log records the complete
 * picture rather than only the first thing that went wrong. There is no AI here
 * and no network I/O; time and the replay ledger arrive through the context,
 * which is what makes a verdict reproducible from its inputs alone.
 */
export function verify(
  snapshot: StateSnapshot,
  context: VerificationContext,
  policy: Policy = DEFAULT_POLICY,
): Verdict {
  // Snapshot integrity gates everything: if the sealed state cannot be trusted,
  // no downstream check means anything.
  const integrity: CheckResult[] = [];

  if (!verifySnapshotHash(snapshot)) {
    integrity.push({
      check: "snapshot_integrity",
      passed: false,
      reason: `Snapshot ${snapshot.snapshot_hash} failed hash verification: its contents changed after it was sealed.`,
      threat_ids: ["T-7"],
    });
  } else if (isSnapshotExpired(snapshot, context.now, policy.snapshot_ttl_seconds)) {
    integrity.push({
      check: "snapshot_integrity",
      passed: false,
      reason: `Snapshot expired: created at ${snapshot.created_at}, evaluated at ${context.now}, TTL ${policy.snapshot_ttl_seconds}s. A fresh approval cycle is required.`,
      threat_ids: ["T-7"],
    });
  }

  if (integrity.length > 0) {
    return {
      decision: "BLOCK",
      snapshot_hash: snapshot.snapshot_hash,
      transaction_id: snapshot.transaction_id,
      results: integrity,
      failed_checks: integrity.map((r) => r.check),
      reason: summarise(integrity),
    };
  }

  const results: CheckResult[] = [
    wysiwysCheck(snapshot),
    fieldCompletenessCheck(snapshot, policy),
    catalogSegregationCheck(snapshot, policy),
    replayCheck(snapshot, context.ledger),
    actorIdentityCheck(snapshot, context.operation, context.actorHmacSecret),
  ];

  const failed_checks = results.filter((r) => !r.passed).map((r) => r.check);

  return {
    decision: failed_checks.length === 0 ? "PASS" : "BLOCK",
    snapshot_hash: snapshot.snapshot_hash,
    transaction_id: snapshot.transaction_id,
    results,
    failed_checks,
    reason: summarise(results),
  };
}
