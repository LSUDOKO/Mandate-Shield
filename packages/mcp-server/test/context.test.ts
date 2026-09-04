import { describe, it, expect } from "vitest";
import { scanForAuthorizationClaims } from "@mandate-shield/core";
import { MOCK_CATALOG } from "@mandate-shield/agent";
import { SessionStore, createContext } from "../src/lib/context.js";
import { loadConfig } from "../src/lib/config.js";
import { formatPaise } from "../src/lib/format.js";

describe("SessionStore", () => {
  it("returns the session it created, with the SKUs that were shown", () => {
    const store = new SessionStore();
    const session = store.create("shoes", ["SHOE-042", "SHOE-101"]);

    expect(store.get(session.session_id)?.sku_results).toEqual(["SHOE-042", "SHOE-101"]);
  });

  it("does not know a session it never created", () => {
    expect(new SessionStore().get("sess_nothing")).toBeUndefined();
  });

  it("bounds itself so a long-lived server cannot grow without limit", () => {
    const store = new SessionStore();
    const first = store.create("first", ["SHOE-042"]);

    for (let i = 0; i < 250; i += 1) store.create(`q${i}`, ["SHOE-042"]);

    expect(store.get(first.session_id)).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("defaults to stdio with every component offline", () => {
    const config = loadConfig({});

    expect(config.transport).toBe("stdio");
    expect(config.groqApiKey).toBeUndefined();
    expect(config.actorHmacSecret).toBe("dev-only-change-me");
  });

  it("selects the HTTP transport from either the flag or the environment", () => {
    expect(loadConfig({}, ["--sse"]).transport).toBe("sse");
    expect(loadConfig({ MCP_TRANSPORT: "sse" }).transport).toBe("sse");
  });

  it("treats a blank credential as absent rather than as a key", () => {
    expect(loadConfig({ GROQ_API_KEY: "   " }).groqApiKey).toBeUndefined();
  });
});

describe("createContext", () => {
  it("runs offline and mocked when no credentials are configured", () => {
    const ctx = createContext({}, []);

    expect(ctx.agent.mode).toBe("offline");
    expect(ctx.gateway.mode).toBe("mock");
    expect(ctx.ledger.verifyChain().intact).toBe(true);
  });
});

describe("formatPaise", () => {
  it("groups rupees the Indian way", () => {
    expect(formatPaise(289900)).toBe("₹2,899.00");
    expect(formatPaise(10000000)).toBe("₹1,00,000.00");
    expect(formatPaise(4900)).toBe("₹49.00");
  });
});

describe("catalog fixtures", () => {
  it("keeps every poisoned listing's claim in a field Check 3 actually scans", () => {
    const poisoned = MOCK_CATALOG.filter((product) => product.poisoned);
    expect(poisoned.length).toBeGreaterThanOrEqual(3);

    for (const product of poisoned) {
      // Check 3 reads name and sku only. A claim that lived solely in the
      // description would make the attack invisible to the check.
      const hits = scanForAuthorizationClaims(`${product.name} ${product.sku}`);
      expect(hits.length, `${product.sku} has no detectable claim in its name`).toBeGreaterThan(0);
    }
  });

  it("leaves ordinary listings free of authorization claims", () => {
    for (const product of MOCK_CATALOG.filter((p) => !p.poisoned)) {
      const hits = scanForAuthorizationClaims(`${product.name} ${product.sku}`);
      expect(hits, `${product.sku} would be blocked as poisoned`).toEqual([]);
    }
  });

  it("offers every category the search tool exposes", () => {
    for (const category of ["footwear", "apparel", "electronics", "fitness", "accessories"]) {
      const count = MOCK_CATALOG.filter((product) => product.category === category).length;
      expect(count, `${category} has too few products`).toBeGreaterThanOrEqual(4);
    }
  });

  it("prices every product within the policy cap so the catalog is actually buyable", () => {
    for (const product of MOCK_CATALOG) {
      expect(product.price_paise).toBeGreaterThan(0);
      expect(product.price_paise).toBeLessThanOrEqual(500000);
    }
  });
});
