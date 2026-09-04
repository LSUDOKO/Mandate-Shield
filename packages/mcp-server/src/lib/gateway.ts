import { PaymentGateway } from "@mandate-shield/gateway";
import type { McpConfig } from "./config.js";

/** Razorpay test mode when keys are present, in-process mock otherwise. */
export function createGateway(config: McpConfig): PaymentGateway {
  return new PaymentGateway({
    keyId: config.razorpayKeyId,
    keySecret: config.razorpayKeySecret,
  });
}
