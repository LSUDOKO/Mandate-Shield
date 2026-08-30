import "dotenv/config";
import { ShoppingAgent } from "@mandate-shield/agent";
import { PaymentGateway } from "@mandate-shield/gateway";
import { AuditLedger } from "@mandate-shield/audit";
import { loadConfig } from "./config.js";
import { Pipeline } from "./pipeline.js";
import { createApp } from "./app.js";

const config = loadConfig(process.env);

const agent = new ShoppingAgent({
  groqApiKey: config.groqApiKey,
  model: config.groqModel,
  actorSecret: config.actorHmacSecret,
});

const gateway = new PaymentGateway({
  keyId: config.razorpayKeyId,
  keySecret: config.razorpayKeySecret,
});

const ledger = new AuditLedger(config.auditDbPath);
const pipeline = new Pipeline({ agent, gateway, ledger, actorHmacSecret: config.actorHmacSecret });

const app = createApp({
  pipeline,
  ledger,
  webhookSecret: config.razorpayWebhookSecret,
  agentMode: agent.mode,
  gatewayMode: gateway.mode,
});

app.listen(config.port, () => {
  console.log(`Mandate Shield listening on :${config.port}`);
  console.log(
    `  agent   ${agent.mode}${agent.mode === "offline" ? " (set GROQ_API_KEY for live intent parsing)" : ""}`,
  );
  console.log(
    `  gateway ${gateway.mode}${gateway.mode === "mock" ? " (set RAZORPAY_KEY_ID/SECRET for test-mode calls)" : ""}`,
  );

  const chain = ledger.verifyChain();
  console.log(`  audit   ${chain.entryCount} entries, chain ${chain.intact ? "intact" : "BROKEN"}`);
});
