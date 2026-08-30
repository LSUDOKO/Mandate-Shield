import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../src/pipeline.js";
import { ShoppingAgent } from "@mandate-shield/agent";
import { PaymentGateway } from "@mandate-shield/gateway";
import { AuditLedger } from "@mandate-shield/audit";

const SECRET = "test-secret";
let ledger: AuditLedger;

function pipeline() {
  return new Pipeline({
    agent: new ShoppingAgent({ actorSecret: SECRET, agentId: "agent-1" }),
    gateway: new PaymentGateway({}),
    ledger,
    actorHmacSecret: SECRET,
  });
}

beforeEach(() => {
  ledger = new AuditLedger(":memory:");
});

afterEach(() => ledger.close());

describe("Pipeline", () => {
  it("passes a well-formed instruction and creates an order", async () => {
    const record = await pipeline().process("buy running shoes from merchant_123 under 3000 INR");
    expect(record.verdict.decision).toBe("PASS");
    expect(record.gateway.kind).toBe("order");
  });

  it("blocks an unauthorized merchant and falls back to a payment link", async () => {
    // No merchant named, so the agent must infer one — Check 2 blocks that.
    const record = await pipeline().process("buy running shoes under 3000 INR");
    expect(record.verdict.decision).toBe("BLOCK");
    expect(record.verdict.failed_checks).toContain("field_completeness");
    expect(record.gateway.kind).toBe("payment_link");
  });

  it("writes an audit entry for a passing transaction", async () => {
    const record = await pipeline().process("buy running shoes from merchant_123 under 3000 INR");
    expect(record.audit_entry.decision).toBe("PASS");
    expect(ledger.getByTransaction(record.transaction_id)).toHaveLength(1);
  });

  it("writes an audit entry for a blocked transaction too", async () => {
    const record = await pipeline().process("buy running shoes under 3000 INR");
    expect(record.audit_entry.decision).toBe("BLOCK");
    expect(record.audit_entry.failed_checks.length).toBeGreaterThan(0);
  });

  it("burns the nonce so an identical replay is blocked", async () => {
    const p = pipeline();
    const first = await p.process("buy running shoes from merchant_123 under 3000 INR", {
      transactionId: "tx-1",
      nonce: "n1",
    });
    expect(first.verdict.decision).toBe("PASS");

    const replay = await p.process("buy running shoes from merchant_123 under 3000 INR", {
      transactionId: "tx-2",
      nonce: "n1",
    });
    expect(replay.verdict.decision).toBe("BLOCK");
    expect(replay.verdict.failed_checks).toContain("replay_ledger");
  });

  it("keeps the audit chain intact across many transactions", async () => {
    const p = pipeline();
    await p.process("buy running shoes from merchant_123 under 3000 INR");
    await p.process("buy a tee from merchant_athleta under 1000 INR");
    await p.process("buy running shoes under 3000 INR");
    expect(ledger.verifyChain().intact).toBe(true);
  });

  it("returns the snapshot the verdict was computed from", async () => {
    const record = await pipeline().process("buy running shoes from merchant_123 under 3000 INR");
    expect(record.snapshot.snapshot_hash).toBe(record.verdict.snapshot_hash);
  });

  it("records every decision in the audit log, blocked ones included", async () => {
    const p = pipeline();
    await p.process("buy running shoes from merchant_123 under 3000 INR");
    await p.process("buy running shoes under 3000 INR");
    const entries = ledger.list();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.decision).sort()).toEqual(["BLOCK", "PASS"]);
  });
});
