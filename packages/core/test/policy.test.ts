import { describe, it, expect } from "vitest";
import {
  DEFAULT_POLICY,
  isAllowedMerchant,
  isAllowedCurrency,
  isPreapprovedDefault,
} from "../src/policy.js";

describe("policy", () => {
  it("states an explicit per-transaction cap in paise", () => {
    expect(DEFAULT_POLICY.per_transaction_cap_paise).toBe(500000);
  });

  it("allows only known merchants", () => {
    expect(isAllowedMerchant(DEFAULT_POLICY, "merchant_123")).toBe(true);
    expect(isAllowedMerchant(DEFAULT_POLICY, "merchant_evil")).toBe(false);
  });

  it("allows only INR", () => {
    expect(isAllowedCurrency(DEFAULT_POLICY, "INR")).toBe(true);
    expect(isAllowedCurrency(DEFAULT_POLICY, "USD")).toBe(false);
  });

  it("treats INR as a pre-approved currency default but no merchant default", () => {
    expect(isPreapprovedDefault(DEFAULT_POLICY, "currency", "INR")).toBe(true);
    expect(isPreapprovedDefault(DEFAULT_POLICY, "currency", "USD")).toBe(false);
    expect(isPreapprovedDefault(DEFAULT_POLICY, "merchant_id", "merchant_123")).toBe(false);
  });

  it("lets catalog data write only to item display and price fields", () => {
    expect(DEFAULT_POLICY.catalog_writable_fields).toEqual([
      "cart.items[].sku",
      "cart.items[].name",
      "cart.items[].unit_price_paise",
      "cart.items[].qty",
    ]);
  });
});
