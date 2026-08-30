export interface Config {
  port: number;
  groqApiKey?: string;
  groqModel: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
  actorHmacSecret: string;
  auditDbPath: string;
  /** Comma-separated origins allowed to call the API from a browser. */
  allowedOrigins: string[];
}

/**
 * Every credential is optional. Absent keys downgrade a component to its
 * offline mode rather than failing startup, so a fresh clone runs end to end.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    port: Number.parseInt(env.PORT ?? "3000", 10),
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
    groqModel: env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    razorpayKeyId: env.RAZORPAY_KEY_ID?.trim() || undefined,
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET?.trim() || undefined,
    razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined,
    actorHmacSecret: env.ACTOR_HMAC_SECRET?.trim() || "dev-only-change-me",
    auditDbPath: env.AUDIT_DB_PATH?.trim() || "./data/audit.db",
    allowedOrigins:
      env.ALLOWED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [],
  };
}
