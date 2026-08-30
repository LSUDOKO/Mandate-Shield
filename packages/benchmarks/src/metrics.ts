export type ThreatClass = "wysiwys" | "field_completeness" | "catalog_injection" | "replay" | "actor_spoofing";

export interface Outcome {
  id: string;
  expected: "PASS" | "BLOCK";
  actual: "PASS" | "BLOCK";
  label: "legitimate" | "attack";
  threat_class: ThreatClass | null;
  failed_checks: string[];
}

export interface Metrics {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  total: number;
}

/**
 * "Positive" means the system blocked. So:
 *   TP = attack correctly blocked, FN = attack that slipped through,
 *   TN = legitimate correctly passed, FP = legitimate wrongly blocked.
 */
export function computeMetrics(outcomes: Outcome[]): Metrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const o of outcomes) {
    if (o.expected === "BLOCK" && o.actual === "BLOCK") tp += 1;
    else if (o.expected === "PASS" && o.actual === "BLOCK") fp += 1;
    else if (o.expected === "PASS" && o.actual === "PASS") tn += 1;
    else fn += 1;
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const total = outcomes.length;

  return { tp, fp, tn, fn, precision, recall, f1, accuracy: total === 0 ? 0 : (tp + tn) / total, total };
}
