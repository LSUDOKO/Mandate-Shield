import { describe, it, expect } from "vitest";
import { computeMetrics } from "../src/metrics.js";
import type { Outcome } from "../src/metrics.js";

function outcome(expected: "PASS" | "BLOCK", actual: "PASS" | "BLOCK", id = "x"): Outcome {
  return {
    id,
    expected,
    actual,
    label: expected === "BLOCK" ? "attack" : "legitimate",
    threat_class: expected === "BLOCK" ? "wysiwys" : null,
    failed_checks: [],
  };
}

describe("computeMetrics", () => {
  it("scores a perfect run as precision and recall 1", () => {
    const m = computeMetrics([
      outcome("BLOCK", "BLOCK", "a"),
      outcome("BLOCK", "BLOCK", "b"),
      outcome("PASS", "PASS", "c"),
    ]);
    expect(m).toMatchObject({ tp: 2, fp: 0, tn: 1, fn: 0, precision: 1, recall: 1, f1: 1 });
  });

  it("counts a missed attack as a false negative and lowers recall", () => {
    const m = computeMetrics([outcome("BLOCK", "BLOCK", "a"), outcome("BLOCK", "PASS", "b")]);
    expect(m.tp).toBe(1);
    expect(m.fn).toBe(1);
    expect(m.recall).toBe(0.5);
  });

  it("counts a wrongly blocked legitimate transaction as a false positive", () => {
    const m = computeMetrics([outcome("BLOCK", "BLOCK", "a"), outcome("PASS", "BLOCK", "b")]);
    expect(m.fp).toBe(1);
    expect(m.precision).toBe(0.5);
  });

  it("reports zero rather than NaN when there are no positives at all", () => {
    const m = computeMetrics([outcome("PASS", "PASS", "a")]);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
  });

  it("computes accuracy across all cases", () => {
    const m = computeMetrics([
      outcome("BLOCK", "BLOCK", "a"),
      outcome("PASS", "PASS", "b"),
      outcome("PASS", "BLOCK", "c"),
      outcome("BLOCK", "PASS", "d"),
    ]);
    expect(m.accuracy).toBe(0.5);
  });
});
