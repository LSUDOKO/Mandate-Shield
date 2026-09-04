/**
 * Environment for the MCP process.
 *
 * Every credential is optional, matching the server package: an absent key
 * downgrades a component to its offline or mock mode rather than failing
 * startup, so `npx tsx src/index.ts` runs end to end on a fresh clone.
 */
export interface McpConfig {
  groqApiKey?: string;
  groqModel: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  actorHmacSecret: string;
  transport: "stdio" | "sse";
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv, argv: string[] = []): McpConfig {
  const wantsSse = argv.includes("--sse") || env.MCP_TRANSPORT?.trim().toLowerCase() === "sse";

  return {
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
    groqModel: env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    razorpayKeyId: env.RAZORPAY_KEY_ID?.trim() || undefined,
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET?.trim() || undefined,
    actorHmacSecret: env.ACTOR_HMAC_SECRET?.trim() || "dev-only-change-me",
    transport: wantsSse ? "sse" : "stdio",
    // MCP_PORT wins when set, so a local run can pick its own port while the
    // API is on 3000. PORT is what a platform host assigns, and binding
    // anything else there means the health check never passes.
    port: Number.parseInt(env.MCP_PORT ?? env.PORT ?? "3100", 10),
  };
}
