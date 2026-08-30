import { describe, it, expect } from "vitest";
import { generateTestBatch } from "../src/generateTestBatch.js";

const batch = generateTestBatch();

describe("generateTestBatch", () => {
  it("produces exactly 50 transactions", () => {
    expect(batch).toHaveLength(50);
  });

  it("splits 35 legitimate and 15 attacks", () => {
    expect(batch.filter((c) => c.label === "legitimate")).toHaveLength(35);
    expect(batch.filter((c) => c.label === "attack")).toHaveLength(15);
  });

  it("includes exactly 3 attacks per threat class", () => {
    for (const cls of ["wysiwys", "field_completeness", "catalog_injection", "replay", "actor_spoofing"]) {
      expect(batch.filter((c) => c.threat_class === cls)).toHaveLength(3);
    }
  });

  it("expects PASS for every legitimate case and BLOCK for every attack", () => {
    expect(batch.filter((c) => c.label === "legitimate").every((c) => c.expected === "PASS")).toBe(true);
    expect(batch.filter((c) => c.label === "attack").every((c) => c.expected === "BLOCK")).toBe(true);
  });

  it("gives every case a unique id and a description", () => {
    expect(new Set(batch.map((c) => c.id)).size).toBe(50);
    expect(batch.every((c) => c.description.length > 0)).toBe(true);
  });

  it("uses unique nonces except for the deliberate replay cases", () => {
    const nonReplay = batch.filter((c) => c.threat_class !== "replay");
    expect(new Set(nonReplay.map((c) => c.draft.nonce)).size).toBe(nonReplay.length);
  });

  it("is deterministic across runs", () => {
    expect(JSON.stringify(generateTestBatch())).toBe(JSON.stringify(batch));
  });

  it("varies price across legitimate cases, including some near the cap", () => {
    const amounts = batch.filter((c) => c.label === "legitimate").map((c) => c.draft.raw_payload_for_signing.amount_paise);
    expect(new Set(amounts).size).toBeGreaterThan(5);
    expect(amounts.some((a) => a > 400000)).toBe(true);
    expect(amounts.some((a) => a < 100000)).toBe(true);
  });
});
