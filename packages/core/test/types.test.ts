import { describe, it, expect } from "vitest";
import { SCOPE_AFFECTING_FIELDS, ACTOR_ROLES, isScopeAffecting } from "../src/types.js";

describe("shared types", () => {
  it("names the fields that materially affect cost or authorization scope", () => {
    expect(SCOPE_AFFECTING_FIELDS).toEqual(["merchant_id", "amount_paise", "currency"]);
  });

  it("recognises scope-affecting fields", () => {
    expect(isScopeAffecting("amount_paise")).toBe(true);
    expect(isScopeAffecting("display_total")).toBe(false);
  });

  it("defines exactly the three actor roles", () => {
    expect(ACTOR_ROLES).toEqual(["shopping_agent", "merchant_agent", "credentials_provider"]);
  });
});
