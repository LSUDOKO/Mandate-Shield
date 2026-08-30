import { describe, it, expect } from "vitest";
import {
  normalizeCategory,
  normalizeAmountPaise,
  normalizeCurrency,
  normalizeMerchantId,
} from "../src/shoppingAgent.js";

/**
 * Model output is untrusted input.
 *
 * These cases are not hypothetical: openai/gpt-oss-120b really does return
 * item_category "running shoes" when the prompt asks for one of five fixed
 * values. Without normalization that value filters the catalog to nothing and
 * the transaction fails for a reason that has nothing to do with security.
 */
describe("normalizeCategory", () => {
  it("accepts the catalog's own categories", () => {
    expect(normalizeCategory("footwear")).toBe("footwear");
    expect(normalizeCategory("apparel")).toBe("apparel");
    expect(normalizeCategory("electronics")).toBe("electronics");
    expect(normalizeCategory("fitness")).toBe("fitness");
    expect(normalizeCategory("accessories")).toBe("accessories");
  });

  it("maps the free text a model actually returns onto a real category", () => {
    expect(normalizeCategory("running shoes")).toBe("footwear");
    expect(normalizeCategory("Sneakers")).toBe("footwear");
    expect(normalizeCategory("t-shirt")).toBe("apparel");
    expect(normalizeCategory("GPS watch")).toBe("electronics");
    expect(normalizeCategory("yoga mat")).toBe("fitness");
    expect(normalizeCategory("water bottle")).toBe("accessories");
  });

  it("tolerates case and surrounding whitespace", () => {
    expect(normalizeCategory("  FOOTWEAR  ")).toBe("footwear");
  });

  it("drops an unrecognised category instead of guessing", () => {
    expect(normalizeCategory("groceries")).toBeUndefined();
    expect(normalizeCategory("")).toBeUndefined();
    expect(normalizeCategory(null)).toBeUndefined();
    expect(normalizeCategory(42)).toBeUndefined();
  });
});

describe("normalizeAmountPaise", () => {
  it("accepts a positive integer amount", () => {
    expect(normalizeAmountPaise(300000)).toBe(300000);
  });

  it("rounds a fractional amount to whole paise", () => {
    expect(normalizeAmountPaise(300000.4)).toBe(300000);
  });

  it("rejects anything that is not a usable amount", () => {
    expect(normalizeAmountPaise(0)).toBeUndefined();
    expect(normalizeAmountPaise(-100)).toBeUndefined();
    expect(normalizeAmountPaise(Number.NaN)).toBeUndefined();
    expect(normalizeAmountPaise(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizeAmountPaise("300000")).toBeUndefined();
  });
});

describe("normalizeCurrency", () => {
  it("accepts a three-letter code and upper-cases it", () => {
    expect(normalizeCurrency("INR")).toBe("INR");
    expect(normalizeCurrency("inr")).toBe("INR");
  });

  it("rejects anything that is not a currency code", () => {
    expect(normalizeCurrency("rupees")).toBeUndefined();
    expect(normalizeCurrency("IN")).toBeUndefined();
    expect(normalizeCurrency("")).toBeUndefined();
    expect(normalizeCurrency(null)).toBeUndefined();
  });

  // Normalizing does not mean allowing: policy still decides. This only
  // guarantees the value has the right shape before Check 2 evaluates it.
  it("normalizes a currency policy will later reject", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
  });
});

describe("normalizeMerchantId", () => {
  it("accepts a well-formed merchant id", () => {
    expect(normalizeMerchantId("merchant_123")).toBe("merchant_123");
    expect(normalizeMerchantId("MERCHANT_Athleta")).toBe("merchant_athleta");
  });

  it("rejects a merchant name the model invented", () => {
    expect(normalizeMerchantId("Nike Official Store")).toBeUndefined();
    expect(normalizeMerchantId("shop_123")).toBeUndefined();
    expect(normalizeMerchantId("")).toBeUndefined();
    expect(normalizeMerchantId(null)).toBeUndefined();
  });
});
