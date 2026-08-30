import { describe, it, expect } from "vitest";
import { parseIntent } from "../src/intentParser.js";
import { searchCatalog } from "../src/catalog.js";

describe("parseIntent", () => {
  it("extracts a rupee budget into paise and marks it explicit", () => {
    const parsed = parseIntent("buy running shoes, budget 3000 INR");
    expect(parsed.constraints.max_amount_paise).toBe(300000);
    expect(parsed.constraints.currency).toBe("INR");
    expect(parsed.explicit_fields).toContain("max_amount");
    expect(parsed.explicit_fields).toContain("currency");
  });

  it("understands the rupee symbol and comma grouping", () => {
    expect(parseIntent("buy a watch under ₹4,500").constraints.max_amount_paise).toBe(450000);
  });

  it("extracts an explicitly named merchant", () => {
    const parsed = parseIntent("buy a tee from merchant_athleta under 1000");
    expect(parsed.constraints.merchant_id).toBe("merchant_athleta");
    expect(parsed.explicit_fields).toContain("merchant_id");
  });

  it("does not invent a merchant the user never named", () => {
    const parsed = parseIntent("buy running shoes, budget 3000");
    expect(parsed.constraints.merchant_id).toBeUndefined();
    expect(parsed.explicit_fields).not.toContain("merchant_id");
  });

  it("infers a product category from the instruction", () => {
    expect(parseIntent("buy running shoes under 3000").constraints.item_category).toBe("footwear");
    expect(parseIntent("buy a yoga mat under 2000").constraints.item_category).toBe("fitness");
  });
});

describe("searchCatalog", () => {
  it("returns only items within the stated budget", () => {
    const results = searchCatalog(parseIntent("buy running shoes, budget 2000 INR"));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.price_paise <= 200000)).toBe(true);
  });

  it("filters to the named merchant", () => {
    const results = searchCatalog(parseIntent("buy a tee from merchant_athleta under 1000"));
    expect(results.every((p) => p.merchant_id === "merchant_athleta")).toBe(true);
  });

  it("returns an empty list when nothing fits the budget", () => {
    expect(searchCatalog(parseIntent("buy running shoes, budget 5 INR"))).toEqual([]);
  });
});
