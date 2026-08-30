import type { Policy } from "../policy.js";
import { SCOPE_AFFECTING_FIELDS, type CheckResult, type StateSnapshot } from "../types.js";

const CHECK = "catalog_segregation";
const THREATS = ["T-1", "T-4"];

/**
 * Text patterns where catalog content attempts to act as authorization rather
 * than staying plain data. This scanner is a reporting aid and defence in
 * depth; the provenance rule below is what actually decides the verdict.
 */
export const AUTHORIZATION_CLAIM_PATTERNS: RegExp[] = [
  /spending?\s*limit\s*(approved|raised|increased|is)?\s*:?\s*\d+/i,
  /budget\s*(increased|raised|extended|approved)\s*(to)?\s*:?\s*\d*/i,
  /authoriz(ed|ation)\s*(up\s*to|for|limit)?\s*:?\s*\d*/i,
  /approved\s*(amount|cap|limit)\s*:?\s*\d+/i,
  /(cap|ceiling|max(imum)?\s*amount)\s*(is|:|=)\s*\d+/i,
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /(system|admin)\s*(prompt|override|instruction)/i,
  /you\s+(are|must)\s+(now\s+)?(allowed|authorized|permitted)/i,
];

export function scanForAuthorizationClaims(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of AUTHORIZATION_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) hits.push(match[0].trim());
  }
  return hits;
}

function fail(reason: string): CheckResult {
  return { check: CHECK, passed: false, reason, threat_ids: THREATS };
}

/**
 * Check 3 — Catalog/authorization segregation.
 * Catalog data may only ever populate item sku, name, unit_price_paise and qty.
 * It may never reach a ceiling, spend cap, merchant or currency field, and it
 * may never assert authorization in its own text.
 */
export function catalogSegregationCheck(snapshot: StateSnapshot, policy: Policy): CheckResult {
  // Layer 1 (decisive): no signing field may carry catalog provenance.
  for (const field of SCOPE_AFFECTING_FIELDS) {
    if (snapshot.field_provenance[field] === "catalog") {
      return fail(`Field "${field}" in the signing payload was sourced from catalog data. Catalog content may only write to [${policy.catalog_writable_fields.join(", ")}].`);
    }
  }

  // Layer 2 (defence in depth): catalog text must not assert authorization.
  const poisoned: string[] = [];
  for (const item of snapshot.cart.items) {
    for (const [field, value] of [["name", item.name], ["sku", item.sku]] as const) {
      for (const hit of scanForAuthorizationClaims(value)) {
        poisoned.push(`item ${item.sku} ${field}: "${hit}"`);
      }
    }
  }

  if (poisoned.length > 0) {
    return fail(`${poisoned.length} catalog field(s) attempted to assert authorization instead of remaining plain product data — ${poisoned.join("; ")}. Catalog content is data, never permission.`);
  }

  return {
    check: CHECK,
    passed: true,
    reason: "Catalog data stayed within its allowed fields and asserted no authorization.",
    threat_ids: THREATS,
  };
}
