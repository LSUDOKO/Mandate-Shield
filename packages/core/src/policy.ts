/**
 * Explicit, named policy constants.
 *
 * Checks never hardcode limits — they read from here, so the benchmark can
 * assert behaviour against policy directly and an operator can see every
 * ceiling in one place.
 */
export interface Policy {
  /** Hard ceiling for any single transaction, in paise. */
  per_transaction_cap_paise: number;
  allowed_currencies: string[];
  allowed_merchants: string[];
  /** How long a snapshot stays valid before a fresh approval cycle is required. */
  snapshot_ttl_seconds: number;
  /**
   * Values the user has pre-approved as defaults, so the agent may fill them in
   * without asking. Anything not listed here must come from explicit intent.
   */
  preapproved_defaults: Record<string, string[]>;
  /** The ONLY paths catalog-sourced data may ever write to. */
  catalog_writable_fields: string[];
}

export const DEFAULT_POLICY: Policy = {
  per_transaction_cap_paise: 500000,
  allowed_currencies: ["INR"],
  allowed_merchants: [
    "merchant_123",
    "merchant_athleta",
    "merchant_urbanfit",
    "merchant_pacerlabs",
    "merchant_daily_essentials",
  ],
  snapshot_ttl_seconds: 300,
  preapproved_defaults: { currency: ["INR"] },
  catalog_writable_fields: [
    "cart.items[].sku",
    "cart.items[].name",
    "cart.items[].unit_price_paise",
    "cart.items[].qty",
  ],
};

export function isAllowedMerchant(policy: Policy, merchantId: string): boolean {
  return policy.allowed_merchants.includes(merchantId);
}

export function isAllowedCurrency(policy: Policy, currency: string): boolean {
  return policy.allowed_currencies.includes(currency);
}

export function isPreapprovedDefault(policy: Policy, field: string, value: string): boolean {
  return (policy.preapproved_defaults[field] ?? []).includes(value);
}
