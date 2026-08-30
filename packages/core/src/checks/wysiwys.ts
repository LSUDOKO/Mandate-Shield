import type { CheckResult, StateSnapshot } from "../types.js";

const CHECK = "wysiwys";
const THREATS = ["T-7"];

/**
 * Parses a human-facing rupee string into integer paise.
 * Display strings are never the source of truth — this exists solely so the
 * displayed value can be compared against the signed value.
 */
export function parseDisplayAmountToPaise(display: string): number | null {
  const match = display.replace(/[,\s]/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match?.[1]) return null;
  const rupees = Number.parseFloat(match[1]);
  if (!Number.isFinite(rupees)) return null;
  return Math.round(rupees * 100);
}

/**
 * Renders integer paise as a rupee string with Indian digit grouping
 * (2,89,900 paise -> "₹2,899.00").
 *
 * Grouping is applied by hand rather than via toLocaleString because that
 * depends on the Node build shipping full ICU data. A small-icu build would
 * silently group differently, which would make a displayed total stop matching
 * its signed amount — the exact divergence Check 1 exists to catch.
 */
export function formatPaiseAsDisplay(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const absolute = Math.abs(paise);
  const rupees = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");

  const digits = String(rupees);
  // Indian grouping: the last three digits, then pairs (12,34,567).
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;

  return `${sign}₹${grouped}.${fraction}`;
}

function fail(reason: string): CheckResult {
  return { check: CHECK, passed: false, reason, threat_ids: THREATS };
}

/**
 * Check 1 — What You See Is What You Sign.
 * Every field the approver was shown must match the field that gets signed,
 * after unit normalization. Any divergence, however small, blocks.
 */
export function wysiwysCheck(snapshot: StateSnapshot): CheckResult {
  const { rendered_view, raw_payload_for_signing, cart } = snapshot;

  const displayedPaise = parseDisplayAmountToPaise(rendered_view.display_total);
  if (displayedPaise === null) {
    return fail(`Displayed total "${rendered_view.display_total}" could not be parsed into an amount, so it cannot be proven to match the signed payload.`);
  }

  if (displayedPaise !== raw_payload_for_signing.amount_paise) {
    return fail(`Rendered-vs-signed divergence: the approver was shown ${displayedPaise} paise ("${rendered_view.display_total}") but the payload signs ${raw_payload_for_signing.amount_paise} paise.`);
  }

  if (cart.total_paise !== raw_payload_for_signing.amount_paise) {
    return fail(`Cart total ${cart.total_paise} paise does not equal the signed amount ${raw_payload_for_signing.amount_paise} paise.`);
  }

  const lineSum = cart.items.reduce((sum, item) => sum + item.unit_price_paise * item.qty, 0);
  if (lineSum !== cart.total_paise) {
    return fail(`Cart line items sum to ${lineSum} paise but the cart total claims ${cart.total_paise} paise.`);
  }

  if (rendered_view.display_merchant !== raw_payload_for_signing.merchant_id) {
    return fail(`Rendered merchant "${rendered_view.display_merchant}" does not match the signed merchant "${raw_payload_for_signing.merchant_id}".`);
  }

  if (cart.currency !== raw_payload_for_signing.currency) {
    return fail(`Cart currency ${cart.currency} does not match the signed currency ${raw_payload_for_signing.currency}.`);
  }

  return {
    check: CHECK,
    passed: true,
    reason: `Rendered view matches signed payload exactly (${raw_payload_for_signing.amount_paise} paise, ${raw_payload_for_signing.merchant_id}).`,
    threat_ids: THREATS,
  };
}
