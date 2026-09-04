import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/index.js";
import { createContext, type ServerContext } from "../src/lib/context.js";

let ctx: ServerContext;
let client: Client;

/** Speaks to the server over the real protocol, not around it. */
async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(ctx);
  const c = new Client({ name: "test", version: "1.0.0" });

  await Promise.all([server.connect(serverTransport), c.connect(clientTransport)]);
  return c;
}

/** Every tool answers with one JSON document; this is that document. */
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  return { body: JSON.parse(content[0]!.text), isError: Boolean(result.isError) };
}

beforeEach(async () => {
  ctx = createContext({}, []);
  client = await connect();
});

describe("tool registration", () => {
  it("exposes exactly the four shopping tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_audit_log",
      "get_transaction_status",
      "initiate_purchase",
      "search_products",
    ]);
  });
});

describe("search_products", () => {
  it("returns priced results and a session id", async () => {
    const { body } = await call("search_products", { query: "trail running", category: "footwear" });

    expect(body.sessionId).toMatch(/^sess_/);
    expect(body.count).toBeGreaterThan(0);
    expect(body.products[0].priceFormatted).toMatch(/^₹/);
  });

  it("honours a price ceiling", async () => {
    const { body } = await call("search_products", { category: "footwear", maxPricePaise: 100000 });

    for (const product of body.products) {
      expect(product.pricePaise).toBeLessThanOrEqual(100000);
    }
  });

  it("returns a poisoned listing rather than hiding it from Check 3", async () => {
    const { body } = await call("search_products", { query: "Elite Runner Z" });

    expect(body.products.some((p: { sku: string }) => p.sku === "POIS-001")).toBe(true);
  });
});

describe("initiate_purchase", () => {
  it("passes a purchase the user fully specified", async () => {
    const search = await call("search_products", { query: "Trail Runner X", category: "footwear" });
    const { body } = await call("initiate_purchase", {
      sku: "SHOE-042",
      userInstruction: "buy the Trail Runner X from merchant_123 under 3000 INR",
      sessionId: search.body.sessionId,
    });

    expect(body.verdict).toBe("PASS");
    expect(body.checkResults).toHaveLength(5);
    expect(body.orderId).toBeTruthy();
    expect(body.snapshotHash).toMatch(/^sha256:/);
  });

  it("blocks a poisoned listing and returns a payment link instead", async () => {
    const search = await call("search_products", { query: "Elite Runner Z" });
    const { body } = await call("initiate_purchase", {
      sku: "POIS-001",
      userInstruction: "buy the Elite Runner Z from merchant_123 under 5000 INR",
      sessionId: search.body.sessionId,
    });

    expect(body.verdict).toBe("BLOCK");
    expect(body.failedChecks).toEqual(["catalog_segregation"]);
    expect(body.paymentUrl).toBeTruthy();
    expect(body.summary).toContain("not lost");
  });

  it("refuses a session it never issued", async () => {
    const { body, isError } = await call("initiate_purchase", {
      sku: "SHOE-042",
      userInstruction: "buy shoes from merchant_123 under 3000 INR",
      sessionId: "sess_fabricated",
    });

    expect(isError).toBe(true);
    expect(body.error).toContain("Unknown sessionId");
  });

  it("refuses a SKU that search never surfaced", async () => {
    const search = await call("search_products", { category: "fitness" });
    const { body, isError } = await call("initiate_purchase", {
      sku: "SHOE-042",
      userInstruction: "buy the Trail Runner X from merchant_123 under 3000 INR",
      sessionId: search.body.sessionId,
    });

    expect(isError).toBe(true);
    expect(body.error).toContain("was not among the results");
  });

  it("refuses a SKU that does not exist", async () => {
    const search = await call("search_products", {});
    const { body, isError } = await call("initiate_purchase", {
      sku: "NOPE-000",
      userInstruction: "buy something from merchant_123 under 3000 INR",
      sessionId: search.body.sessionId,
    });

    expect(isError).toBe(true);
    expect(body.error).toContain("No catalog product");
  });
});

describe("get_transaction_status and get_audit_log", () => {
  it("returns a processed transaction and records it on the chain", async () => {
    const search = await call("search_products", { query: "Trail Runner X", category: "footwear" });
    const purchase = await call("initiate_purchase", {
      sku: "SHOE-042",
      userInstruction: "buy the Trail Runner X from merchant_123 under 3000 INR",
      sessionId: search.body.sessionId,
    });

    const status = await call("get_transaction_status", { transactionId: purchase.body.transactionId });
    expect(status.body.verdict).toBe("PASS");
    expect(status.body.cart.items[0].sku).toBe("SHOE-042");

    const audit = await call("get_audit_log", { limit: 5 });
    expect(audit.body.chain.intact).toBe(true);
    expect(audit.body.entries[0].transactionId).toBe(purchase.body.transactionId);
    // The tool states what the ledger can and cannot promise.
    expect(audit.body.persistence).toContain("in-memory");
  });

  it("reports an unknown transaction rather than inventing one", async () => {
    const { body, isError } = await call("get_transaction_status", { transactionId: "tx-nope" });

    expect(isError).toBe(true);
    expect(body.error).toContain("No transaction");
  });

  it("starts with an intact, empty chain", async () => {
    const { body } = await call("get_audit_log", {});

    expect(body.chain).toEqual({ intact: true, brokenAtIndex: null, entryCount: 0 });
    expect(body.entries).toEqual([]);
  });
});
