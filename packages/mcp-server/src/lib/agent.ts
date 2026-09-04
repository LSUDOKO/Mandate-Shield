import { ShoppingAgent } from "@mandate-shield/agent";
import type { McpConfig } from "./config.js";

/**
 * The shopping agent, in Groq mode when a key is configured and deterministic
 * otherwise. Either way its output is untrusted input to the verifier.
 */
export function createAgent(config: McpConfig): ShoppingAgent {
  return new ShoppingAgent({
    groqApiKey: config.groqApiKey,
    model: config.groqModel,
    actorSecret: config.actorHmacSecret,
    agentId: "mcp-shopping-agent",
  });
}
