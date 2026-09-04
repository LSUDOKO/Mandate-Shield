import { formatPaise } from "./format.js";
import type { TransactionRecord } from "./pipeline.js";

/**
 * One sentence a model can relay to a person without re-deriving it.
 *
 * A BLOCK is deliberately not phrased as a failure: the purchase is still
 * completable by hand, and a client that reads this as "the payment failed"
 * would tell the user something untrue.
 */
export function summarise(record: TransactionRecord): string {
  const { verdict, gateway, snapshot } = record;
  const amount = formatPaise(snapshot.raw_payload_for_signing.amount_paise);
  const merchant = snapshot.raw_payload_for_signing.merchant_id;

  if (verdict.decision === "PASS") {
    const orderId = gateway.kind === "order" ? ` Razorpay order ${gateway.id} is ready.` : "";
    return (
      `All 5 checks passed. ${amount} to ${merchant} is authorized and matches what the user asked for.` +
      orderId
    );
  }

  const failed = verdict.failed_checks.join(", ");
  const link =
    gateway.kind === "payment_link"
      ? ` The purchase is not lost: the user can complete it themselves at ${gateway.short_url}, where their own UPI PIN authorizes the payment.`
      : "";

  return (
    `Blocked before signing by ${failed}. ${verdict.reason} ` +
    `No agent-authorized payment of ${amount} to ${merchant} was made.${link}`
  );
}
