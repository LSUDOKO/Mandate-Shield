import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSnapshot, verify, InMemoryReplayLedger, DEFAULT_POLICY } from "@mandate-shield/core";
import { generateTestBatch, BENCHMARK_ACTOR_SECRET, type TestCase } from "./generateTestBatch.js";
import { computeMetrics, type Metrics, type Outcome, type ThreatClass } from "./metrics.js";

const NOW = "2026-08-30T10:00:00.000Z";

function runCase(testCase: TestCase, ledger: InMemoryReplayLedger): Outcome {
  const snapshot = createSnapshot(testCase.draft, NOW);
  const verdict = verify(
    snapshot,
    { operation: "request_verification", now: NOW, ledger, actorHmacSecret: BENCHMARK_ACTOR_SECRET },
    DEFAULT_POLICY,
  );

  // Nonces are burned once a verdict exists, so later replays are detected.
  ledger.recordNonce(snapshot.nonce, snapshot.transaction_id, NOW);

  return {
    id: testCase.id,
    expected: testCase.expected,
    actual: verdict.decision,
    label: testCase.label,
    threat_class: testCase.threat_class,
    failed_checks: verdict.failed_checks,
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function perClass(outcomes: Outcome[]): Record<string, { total: number; blocked: number }> {
  const classes: ThreatClass[] = ["wysiwys", "field_completeness", "catalog_injection", "replay", "actor_spoofing"];
  const summary: Record<string, { total: number; blocked: number }> = {};
  for (const cls of classes) {
    const cases = outcomes.filter((o) => o.threat_class === cls);
    summary[cls] = { total: cases.length, blocked: cases.filter((o) => o.actual === "BLOCK").length };
  }
  return summary;
}

function report(outcomes: Outcome[], metrics: Metrics): string {
  const byClass = perClass(outcomes);
  const falseNegatives = outcomes.filter((o) => o.expected === "BLOCK" && o.actual === "PASS");
  const falsePositives = outcomes.filter((o) => o.expected === "PASS" && o.actual === "BLOCK");

  const lines = [
    "# Mandate Shield — Benchmark Results",
    "",
    `Generated from a deterministic 50-transaction batch (${metrics.total} evaluated).`,
    "Reproduce with `npm run benchmark`. The batch is seeded, so these numbers are byte-stable.",
    "",
    "## Composition",
    "",
    "| Group | Count |",
    "|---|---|",
    `| Legitimate transactions | ${outcomes.filter((o) => o.label === "legitimate").length} |`,
    `| Attack transactions | ${outcomes.filter((o) => o.label === "attack").length} |`,
    "",
    "## Confusion matrix",
    "",
    "A *positive* is a transaction the system blocked.",
    "",
    "| | Predicted BLOCK | Predicted PASS |",
    "|---|---|---|",
    `| **Actually an attack** | ${metrics.tp} (TP) | ${metrics.fn} (FN) |`,
    `| **Actually legitimate** | ${metrics.fp} (FP) | ${metrics.tn} (TN) |`,
    "",
    "## Metrics",
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Precision | ${pct(metrics.precision)} |`,
    `| Recall | ${pct(metrics.recall)} |`,
    `| F1 | ${pct(metrics.f1)} |`,
    `| Accuracy | ${pct(metrics.accuracy)} |`,
    "",
    "## Detection by threat class",
    "",
    "| Threat class | Attacks | Blocked | Detection rate |",
    "|---|---|---|---|",
    ...Object.entries(byClass).map(([cls, s]) =>
      `| ${cls} | ${s.total} | ${s.blocked} | ${s.total === 0 ? "n/a" : pct(s.blocked / s.total)} |`,
    ),
    "",
    "## Errors",
    "",
    falseNegatives.length === 0
      ? "**False negatives: none.** Every simulated attack was blocked."
      : `**False negatives (${falseNegatives.length}) — attacks that slipped through:**\n\n${falseNegatives.map((o) => `- \`${o.id}\` (${o.threat_class})`).join("\n")}`,
    "",
    falsePositives.length === 0
      ? "**False positives: none.** Every legitimate transaction passed."
      : `**False positives (${falsePositives.length}) — legitimate transactions wrongly blocked:**\n\n${falsePositives.map((o) => `- \`${o.id}\` — failed [${o.failed_checks.join(", ")}]`).join("\n")}`,
    "",
    "## False-positive cost, in business terms",
    "",
    "The two error types are not symmetric, and the system is deliberately tuned toward the cheaper one.",
    "",
    "- **A false positive** bounces a real customer's purchase to a Razorpay Payment Link, where they complete",
    "  it with a normal UPI PIN or OTP. The purchase still happens; the customer absorbs added friction and the",
    "  merchant risks some cart abandonment. Annoying, measurable, recoverable.",
    "- **A false negative** is an unauthorized charge: money moves for something the user never agreed to. The",
    "  cost is the transaction value plus chargeback handling, support load, and trust damage that no refund undoes.",
    "",
    "Because a false negative is strictly worse, every check fails closed: ambiguity blocks rather than passes.",
    "That is also why a non-zero false-positive rate is an acceptable operating point, while a non-zero false-",
    "negative rate is a defect to be fixed.",
    "",
    "## Scope",
    "",
    "These 5 threat classes are drawn from the 48 catalogued in *Beyond the Mandate: A Systematic Security",
    "Analysis of the Agent Payments Protocol (AP2)* (arXiv:2608.23858). They were chosen for being concrete and",
    "directly relevant to a Razorpay-style mandate flow — not because the other 43 do not matter.",
    "",
  ];

  return lines.join("\n");
}

function main(): void {
  const batch = generateTestBatch();
  const ledger = new InMemoryReplayLedger();
  const outcomes = batch.map((testCase) => runCase(testCase, ledger));
  const metrics = computeMetrics(outcomes);

  console.log("\nMandate Shield — 50-transaction benchmark\n");
  console.log(`  Evaluated       ${metrics.total}`);
  console.log(`  True positives  ${metrics.tp}   (attacks blocked)`);
  console.log(`  False negatives ${metrics.fn}   (attacks missed)`);
  console.log(`  True negatives  ${metrics.tn}   (legitimate passed)`);
  console.log(`  False positives ${metrics.fp}   (legitimate blocked)`);
  console.log(`  Precision       ${pct(metrics.precision)}`);
  console.log(`  Recall          ${pct(metrics.recall)}`);
  console.log(`  F1              ${pct(metrics.f1)}\n`);

  for (const [cls, s] of Object.entries(perClass(outcomes))) {
    console.log(`  ${cls.padEnd(20)} ${s.blocked}/${s.total} blocked`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, "..", "results.md"), report(outcomes, metrics));
  writeFileSync(join(here, "..", "results.json"), `${JSON.stringify({ metrics, outcomes }, null, 2)}\n`);
  console.log("\nWrote results.md and results.json\n");

  if (metrics.fn > 0) {
    console.error(`FAIL: ${metrics.fn} attack(s) slipped through.`);
    process.exit(1);
  }
}

main();
