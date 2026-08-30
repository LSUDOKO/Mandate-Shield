import { isAllowedCurrency, isAllowedMerchant, isPreapprovedDefault, type Policy } from "../policy.js";
import { SCOPE_AFFECTING_FIELDS, type CheckResult, type StateSnapshot } from "../types.js";

const CHECK = "field_completeness";
const THREATS = ["T-6"];

function fail(reason: string): CheckResult {
  return { check: CHECK, passed: false, reason, threat_ids: THREATS };
}

/**
 * Check 2 — Field completeness.
 * Every field in the signing payload that materially affects cost or
 * authorization scope must trace to something the user explicitly stated, or
 * to a default the user pre-approved in policy. A field the agent silently
 * filled in is not authorization.
 */
export function fieldCompletenessCheck(snapshot: StateSnapshot, policy: Policy): CheckResult {
  const payload = snapshot.raw_payload_for_signing;
  const provenance = snapshot.field_provenance;

  for (const field of SCOPE_AFFECTING_FIELDS) {
    const source = provenance[field];
    const value = String(payload[field]);

    if (!source) {
      return fail(`Field "${field}" (value ${value}) affects authorization scope but has no recorded authorization source.`);
    }

    if (source === "catalog") {
      return fail(`Field "${field}" was sourced from catalog data, which is never authorization.`);
    }

    if (source === "agent_inferred") {
      return fail(`Field "${field}" was agent_inferred: the agent filled in ${value} instead of asking the user, and no policy default covers it.`);
    }

    if (source === "policy_default" && !isPreapprovedDefault(policy, field, value)) {
      return fail(`Field "${field}" claims the pre-approved default ${value}, but policy pre-approves only [${(policy.preapproved_defaults[field] ?? []).join(", ") || "nothing"}] for that field.`);
    }
  }

  if (!isAllowedMerchant(policy, payload.merchant_id)) {
    return fail(`Merchant ${payload.merchant_id} is not on the policy allowlist.`);
  }

  if (!isAllowedCurrency(policy, payload.currency)) {
    return fail(`Currency ${payload.currency} is not on the policy allowlist.`);
  }

  const userCeiling = snapshot.user_intent.constraints.max_amount_paise;
  if (typeof userCeiling === "number" && payload.amount_paise > userCeiling) {
    return fail(`Amount ${payload.amount_paise} paise exceeds the user's stated ceiling of ${userCeiling} paise.`);
  }

  if (payload.amount_paise > policy.per_transaction_cap_paise) {
    return fail(`Amount ${payload.amount_paise} paise exceeds the policy cap of ${policy.per_transaction_cap_paise} paise.`);
  }

  return {
    check: CHECK,
    passed: true,
    reason: "Every scope-affecting field traces to explicit user intent or a pre-approved policy default, and all values are within policy.",
    threat_ids: THREATS,
  };
}
