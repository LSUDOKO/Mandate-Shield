import Razorpay from "razorpay";
import { randomUUID } from "node:crypto";

export interface OrderInput {
  amount_paise: number;
  currency: string;
  transaction_id: string;
  notes?: Record<string, string>;
}

export interface LinkInput extends OrderInput {
  reason: string;
  customer?: { name?: string; email?: string };
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  mode: "live" | "mock";
}

export interface GatewayPaymentLink {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  status: string;
  mode: "live" | "mock";
}

/**
 * Razorpay wrapper.
 *
 * Runs against the real test-mode API when keys are configured, and against an
 * in-process mock otherwise, so the repository clones and runs with no
 * credentials. The active mode is surfaced on every result and on the health
 * endpoint — nothing is ever presented as live when it is not.
 */
export class PaymentGateway {
  readonly mode: "live" | "mock";
  private readonly client: Razorpay | null;

  constructor(options: { keyId?: string; keySecret?: string }) {
    const keyId = options.keyId?.trim();
    const keySecret = options.keySecret?.trim();

    if (keyId && keySecret) {
      this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
      this.mode = "live";
    } else {
      this.client = null;
      this.mode = "mock";
    }
  }

  /** Happy path: Mandate Shield returned PASS. */
  async createOrder(input: OrderInput): Promise<GatewayOrder> {
    this.assertAmount(input.amount_paise);

    if (!this.client) {
      return {
        id: `order_mock_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
        amount: input.amount_paise,
        currency: input.currency,
        status: "created",
        mode: "mock",
      };
    }

    const order = await this.client.orders.create({
      amount: input.amount_paise,
      currency: input.currency,
      receipt: input.transaction_id,
      notes: { transaction_id: input.transaction_id, ...input.notes },
    });

    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      mode: "live",
    };
  }

  /**
   * Graceful failure: Mandate Shield returned BLOCK.
   *
   * Instead of dropping the purchase we hand the human a link to complete it
   * under normal UPI PIN / OTP authorization. The agent is removed from the
   * loop — the customer is not.
   */
  async createPaymentLink(input: LinkInput): Promise<GatewayPaymentLink> {
    this.assertAmount(input.amount_paise);

    if (!this.client) {
      const id = `plink_mock_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      return {
        id,
        short_url: `https://rzp.io/i/mock-${id.slice(-8)}`,
        amount: input.amount_paise,
        currency: input.currency,
        status: "created",
        mode: "mock",
      };
    }

    const link = await this.client.paymentLink.create({
      amount: input.amount_paise,
      currency: input.currency,
      description: `Manual approval required: ${input.reason}`.slice(0, 2048),
      reference_id: input.transaction_id,
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: {
        transaction_id: input.transaction_id,
        block_reason: input.reason.slice(0, 250),
      },
    });

    return {
      id: String(link.id),
      short_url: String(link.short_url),
      amount: Number(link.amount),
      currency: String(link.currency),
      status: String(link.status),
      mode: "live",
    };
  }

  private assertAmount(amountPaise: number): void {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new Error(`Invalid amount: ${amountPaise} paise. Amount must be a positive integer.`);
    }
  }
}
