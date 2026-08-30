import type { CheckResult } from "../api";

/** Fixed order, so a given rung always means the same check. */
export const CHECK_ORDER = [
  "wysiwys",
  "field_completeness",
  "catalog_segregation",
  "replay_ledger",
  "actor_identity",
] as const;

export const CHECK_LABELS: Record<string, string> = {
  wysiwys: "What you see is what you sign",
  field_completeness: "Field completeness",
  catalog_segregation: "Catalog / authorization segregation",
  replay_ledger: "Nonce replay",
  actor_identity: "Actor identity",
  snapshot_integrity: "Snapshot integrity",
};

/**
 * The signature element: five stacked bars in fixed order, so which check
 * failed is visible spatially before any text is read.
 */
export function CheckLadder({ results }: { results: CheckResult[] }) {
  const byName = new Map(results.map((r) => [r.check, r]));

  return (
    <div className="ladder" aria-hidden="true">
      {CHECK_ORDER.map((name) => {
        const result = byName.get(name);
        const state = !result ? "" : result.passed ? "pass" : "fail";
        return <span key={name} className={`rung ${state}`} />;
      })}
    </div>
  );
}
