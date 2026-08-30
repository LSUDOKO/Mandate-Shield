import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { createApp } from "../src/app.js";
import { Pipeline } from "../src/pipeline.js";
import { ShoppingAgent } from "@mandate-shield/agent";
import { PaymentGateway } from "@mandate-shield/gateway";
import { AuditLedger } from "@mandate-shield/audit";

const SECRET = "test-secret";
const WEBHOOK_SECRET = "webhook-secret";

let ledger: AuditLedger;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  ledger = new AuditLedger(":memory:");
  const pipeline = new Pipeline({
    agent: new ShoppingAgent({ actorSecret: SECRET, agentId: "agent-1" }),
    gateway: new PaymentGateway({}),
    ledger,
    actorHmacSecret: SECRET,
  });
  app = createApp({
    pipeline,
    ledger,
    webhookSecret: WEBHOOK_SECRET,
    agentMode: "offline",
    gatewayMode: "mock",
  });
});

afterEach(() => ledger.close());

describe("GET /api/health", () => {
  it("reports component modes honestly", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", agent_mode: "offline", gateway_mode: "mock" });
  });
});

describe("POST /api/transactions", () => {
  it("returns a PASS verdict for a well-formed instruction", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy running shoes from merchant_123 under 3000 INR" });
    expect(res.status).toBe(200);
    expect(res.body.verdict.decision).toBe("PASS");
    expect(res.body.gateway.kind).toBe("order");
  });

  it("returns BLOCK with a payment link for an unauthorized merchant", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy running shoes under 3000 INR" });
    expect(res.status).toBe(200);
    expect(res.body.verdict.decision).toBe("BLOCK");
    expect(res.body.gateway.kind).toBe("payment_link");
  });

  it("rejects a request with no instruction", async () => {
    const res = await request(app).post("/api/transactions").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/instruction/i);
  });

  it("rejects a blank instruction", async () => {
    const res = await request(app).post("/api/transactions").send({ instruction: "   " });
    expect(res.status).toBe(400);
  });

  it("reports an agent failure as a 422 rather than a crash", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy running shoes under 5 INR" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no catalog item/i);
  });

  it("returns all five check results so a reviewer sees the whole picture", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy running shoes from merchant_123 under 3000 INR" });
    expect(res.body.verdict.results).toHaveLength(5);
  });
});

describe("GET /api/transactions", () => {
  it("lists processed transactions newest first", async () => {
    await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy running shoes from merchant_123 under 3000 INR" });
    await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy a tee from merchant_athleta under 1000 INR" });

    const res = await request(app).get("/api/transactions");
    expect(res.body).toHaveLength(2);
    expect(res.body[0].instruction).toMatch(/tee/);
  });

  it("returns a single transaction with its snapshot and check results", async () => {
    const created = await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy running shoes from merchant_123 under 3000 INR" });

    const res = await request(app).get(`/api/transactions/${created.body.transaction_id}`);
    expect(res.status).toBe(200);
    expect(res.body.snapshot.snapshot_hash).toBe(res.body.verdict.snapshot_hash);
    expect(res.body.verdict.results).toHaveLength(5);
  });

  it("404s an unknown transaction", async () => {
    expect((await request(app).get("/api/transactions/nope")).status).toBe(404);
  });
});

describe("GET /api/audit", () => {
  it("returns entries and confirms the chain is intact", async () => {
    await request(app)
      .post("/api/transactions")
      .send({ instruction: "buy running shoes from merchant_123 under 3000 INR" });

    expect((await request(app).get("/api/audit")).body.entries).toHaveLength(1);
    expect((await request(app).get("/api/audit/verify")).body).toMatchObject({
      intact: true,
      brokenAtIndex: null,
    });
  });
});

describe("POST /api/webhooks/razorpay", () => {
  const body = JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: "plink_1", status: "paid", notes: { transaction_id: "tx-1" } } },
    },
  });

  it("accepts a correctly signed webhook", async () => {
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("x-razorpay-signature", signature)
      .set("content-type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.event.transaction_id).toBe("tx-1");
  });

  it("rejects an unsigned webhook", async () => {
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("content-type", "application/json")
      .send(body);
    expect(res.status).toBe(401);
  });

  it("rejects a forged signature", async () => {
    const res = await request(app)
      .post("/api/webhooks/razorpay")
      .set("x-razorpay-signature", "deadbeef")
      .set("content-type", "application/json")
      .send(body);
    expect(res.status).toBe(401);
  });
});

describe("CORS allowlist", () => {
  function appWithOrigins(allowedOrigins: string[]) {
    const pipeline = new Pipeline({
      agent: new ShoppingAgent({ actorSecret: SECRET, agentId: "agent-1" }),
      gateway: new PaymentGateway({}),
      ledger,
      actorHmacSecret: SECRET,
    });
    return createApp({
      pipeline,
      ledger,
      webhookSecret: WEBHOOK_SECRET,
      agentMode: "offline",
      gatewayMode: "mock",
      allowedOrigins,
    });
  }

  it("allows any origin when no allowlist is configured", async () => {
    const res = await request(appWithOrigins([]))
      .get("/api/health")
      .set("origin", "https://anything.example");
    expect(res.status).toBe(200);
  });

  it("allows an origin on the list", async () => {
    const res = await request(appWithOrigins(["https://shield.example"]))
      .get("/api/health")
      .set("origin", "https://shield.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://shield.example");
  });

  it("refuses an origin that is not on the list", async () => {
    const res = await request(appWithOrigins(["https://shield.example"]))
      .get("/api/health")
      .set("origin", "https://evil.example");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("still serves callers that send no origin, such as curl and health checks", async () => {
    const res = await request(appWithOrigins(["https://shield.example"])).get("/api/health");
    expect(res.status).toBe(200);
  });
});
