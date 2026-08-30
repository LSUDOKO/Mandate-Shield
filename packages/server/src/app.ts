import express from "express";
import cors from "cors";
import { createRoutes, type RouteDeps } from "./routes.js";

export interface AppDeps extends RouteDeps {
  /**
   * Origins permitted to call the API from a browser. Empty allows any origin,
   * which is right for local development and for a public read-mostly demo,
   * but a deployment that sets this gets a real allowlist.
   */
  allowedOrigins?: string[];
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();

  const allowed = deps.allowedOrigins?.filter(Boolean) ?? [];
  app.use(
    cors(
      allowed.length === 0
        ? {}
        : {
            origin(origin, callback) {
              // Same-origin and non-browser callers send no Origin header.
              if (!origin || allowed.includes(origin)) return callback(null, true);
              callback(new Error(`Origin ${origin} is not allowed`));
            },
          },
    ),
  );

  // The webhook route needs the raw body to verify Razorpay's signature, so it
  // is parsed as text before the JSON parser can rewrite the bytes.
  app.use("/api/webhooks/razorpay", express.text({ type: "*/*" }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createRoutes(deps));

  return app;
}
