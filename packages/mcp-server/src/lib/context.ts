import { randomUUID } from "node:crypto";
import { MOCK_CATALOG, type CatalogProduct } from "@mandate-shield/agent";
import type { DecisionLedger } from "@mandate-shield/audit";
import type { ShoppingAgent } from "@mandate-shield/agent";
import type { PaymentGateway } from "@mandate-shield/gateway";
import { createAgent } from "./agent.js";
import { createGateway } from "./gateway.js";
import { createLedger } from "./ledger.js";
import { Pipeline } from "./pipeline.js";
import { loadConfig, type McpConfig } from "./config.js";

/**
 * A search the client performed, remembered so a later purchase can be tied
 * back to the listing the client actually saw.
 *
 * This is provenance for the MCP boundary. Without it a client could name any
 * SKU out of thin air and we would have no record of what was on screen when
 * the decision was made. Sessions are bounded so a long-lived server cannot
 * grow without limit.
 */
export interface SearchSession {
  session_id: string;
  created_at: string;
  query: string;
  sku_results: string[];
}

const MAX_SESSIONS = 200;

export class SessionStore {
  private readonly sessions = new Map<string, SearchSession>();

  create(query: string, skus: string[]): SearchSession {
    const session: SearchSession = {
      session_id: `sess_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      created_at: new Date().toISOString(),
      query,
      sku_results: skus,
    };

    this.sessions.set(session.session_id, session);

    // Oldest first out of a Map's insertion order.
    while (this.sessions.size > MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }

    return session;
  }

  get(sessionId: string): SearchSession | undefined {
    return this.sessions.get(sessionId);
  }
}

export interface ServerContext {
  config: McpConfig;
  agent: ShoppingAgent;
  gateway: PaymentGateway;
  ledger: DecisionLedger;
  pipeline: Pipeline;
  sessions: SessionStore;
  catalog: CatalogProduct[];
}

/** Wires every component once, at process start. */
export function createContext(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): ServerContext {
  const config = loadConfig(env, argv);
  const agent = createAgent(config);
  const gateway = createGateway(config);
  const ledger = createLedger();

  return {
    config,
    agent,
    gateway,
    ledger,
    pipeline: new Pipeline({ agent, gateway, ledger, actorHmacSecret: config.actorHmacSecret }),
    sessions: new SessionStore(),
    catalog: MOCK_CATALOG,
  };
}
