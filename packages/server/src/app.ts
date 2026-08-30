import express from "express";
import cors from "cors";
import { createRoutes, type RouteDeps } from "./routes.js";

export type AppDeps = RouteDeps;

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(cors());

  // The webhook route needs the raw body to verify Razorpay's signature, so it
  // is parsed as text before the JSON parser can rewrite the bytes.
  app.use("/api/webhooks/razorpay", express.text({ type: "*/*" }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createRoutes(deps));

  return app;
}
