import { describe, it, expect } from "vitest";
import { PaymentGateway } from "../src/razorpayClient.js";

const gateway = () => new PaymentGateway({});

describe("PaymentGateway mode selection", () => {
  it("falls back to mock mode when no keys are configured", () => {
    expect(gateway().mode).toBe("mock");
  });

  it("uses live mode when both keys are present", () => {
    expect(new PaymentGateway({ keyId: "rzp_test_x", keySecret: "s" }).mode).toBe("live");
  });

  it("stays in mock mode when only one key is present", () => {
    expect(new PaymentGateway({ keyId: "rzp_test_x" }).mode).toBe("mock");
  });

  it("treats a blank key as absent", () => {
    expect(new PaymentGateway({ keyId: "   ", keySecret: "  " }).mode).toBe("mock");
  });
});

describe("PaymentGateway.createOrder (mock mode)", () => {
  it("creates an order echoing the requested amount and currency", async () => {
    const order = await gateway().createOrder({
      amount_paise: 289900,
      currency: "INR",
      transaction_id: "tx-1",
    });
    expect(order.amount).toBe(289900);
    expect(order.currency).toBe("INR");
    expect(order.id).toMatch(/^order_/);
    expect(order.mode).toBe("mock");
    expect(order.status).toBe("created");
  });

  it("gives every mock order a distinct id", async () => {
    const g = gateway();
    const a = await g.createOrder({ amount_paise: 100, currency: "INR", transaction_id: "tx-1" });
    const b = await g.createOrder({ amount_paise: 100, currency: "INR", transaction_id: "tx-2" });
    expect(a.id).not.toBe(b.id);
  });

  it("rejects a non-positive amount before reaching the network", async () => {
    await expect(
      gateway().createOrder({ amount_paise: 0, currency: "INR", transaction_id: "tx-1" }),
    ).rejects.toThrow(/amount/i);
  });

  it("rejects a fractional amount, since money is integer paise", async () => {
    await expect(
      gateway().createOrder({ amount_paise: 100.5, currency: "INR", transaction_id: "tx-1" }),
    ).rejects.toThrow(/amount/i);
  });
});

describe("PaymentGateway.createPaymentLink (mock mode)", () => {
  it("creates a payment link with a usable short url", async () => {
    const link = await gateway().createPaymentLink({
      amount_paise: 289900,
      currency: "INR",
      transaction_id: "tx-1",
      reason: "blocked by wysiwys check",
    });
    expect(link.id).toMatch(/^plink_/);
    expect(link.short_url).toMatch(/^https:\/\//);
    expect(link.amount).toBe(289900);
    expect(link.mode).toBe("mock");
  });

  it("rejects a non-positive amount on the fallback path too", async () => {
    await expect(
      gateway().createPaymentLink({
        amount_paise: -1,
        currency: "INR",
        transaction_id: "tx-1",
        reason: "blocked",
      }),
    ).rejects.toThrow(/amount/i);
  });
});
