import type { IntentConstraints } from "@mandate-shield/core";

export interface ParsedIntent {
  constraints: IntentConstraints;
  /** Names of constraints the user stated outright, not ones we guessed. */
  explicit_fields: string[];
}

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(shoes?|sneakers?|runners?|footwear|trainers?)\b/i, "footwear"],
  [/\b(tee|shirt|jacket|tights|apparel|clothing|windbreaker)\b/i, "apparel"],
  [/\b(watch|earbuds|headphones|electronics|gps)\b/i, "electronics"],
  [/\b(yoga|mat|resistance|fitness|gym)\b/i, "fitness"],
  [/\b(belt|armband|bottle|accessor(y|ies))\b/i, "accessories"],
];

/**
 * Deterministic intent parsing. Used directly when no GROQ_API_KEY is set, and
 * used to validate Groq's output when one is. Only records a constraint as
 * explicit when the instruction actually states it.
 */
export function parseIntent(instruction: string): ParsedIntent {
  const constraints: IntentConstraints = {};
  const explicit_fields: string[] = [];

  const amount = instruction
    .replace(/,/g, "")
    .match(/(?:budget|under|below|max(?:imum)?|cap|upto|up to|₹|rs\.?)\s*₹?\s*(\d+(?:\.\d{1,2})?)/i);
  if (amount?.[1]) {
    constraints.max_amount_paise = Math.round(Number.parseFloat(amount[1]) * 100);
    explicit_fields.push("max_amount");
  }

  if (/\b(inr|rupees?|₹|rs\.?)\b/i.test(instruction)) {
    constraints.currency = "INR";
    explicit_fields.push("currency");
  }

  const merchant = instruction.match(/\b(merchant_[a-z0-9_]+)\b/i);
  if (merchant?.[1]) {
    constraints.merchant_id = merchant[1].toLowerCase();
    explicit_fields.push("merchant_id");
  }

  for (const [pattern, category] of CATEGORY_KEYWORDS) {
    if (pattern.test(instruction)) {
      constraints.item_category = category;
      explicit_fields.push("item_category");
      break;
    }
  }

  return { constraints, explicit_fields };
}
