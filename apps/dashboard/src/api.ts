export interface CheckResult {
  check: string;
  passed: boolean;
  reason: string;
  threat_ids: string[];
}

export interface TransactionRecord {
  transaction_id: string;
  instruction: string;
  created_at: string;
  snapshot: {
    snapshot_hash: string;
    created_at: string;
    nonce: string;
    rendered_view: { display_total: string; display_merchant: string; display_items: string[] };
    raw_payload_for_signing: { merchant_id: string; amount_paise: number; currency: string };
    field_provenance: Record<string, string>;
    cart: { items: Array<{ sku: string; name: string; unit_price_paise: number; qty: number }> };
    actor: { role: string; agent_id: string };
  };
  verdict: {
    decision: "PASS" | "BLOCK";
    results: CheckResult[];
    failed_checks: string[];
    reason: string;
    snapshot_hash: string;
  };
  gateway: {
    kind: string;
    id?: string;
    short_url?: string;
    mode?: string;
    reason?: string;
    amount?: number;
  };
  audit_entry: { entry_id: string; entry_hash: string; prev_entry_hash: string };
}

export interface AuditEntry {
  entry_id: string;
  transaction_id: string;
  timestamp: string;
  decision: "PASS" | "BLOCK";
  failed_checks: string[];
  reason: string;
  entry_hash: string;
  prev_entry_hash: string;
}

export interface ChainResult {
  intact: boolean;
  brokenAtIndex: number | null;
  entryCount: number;
}

export interface Health {
  status: string;
  agent_mode: "groq" | "offline";
  gateway_mode: "live" | "mock";
  audit_chain: ChainResult;
}

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export const api = {
  health: () => json<Health>("/api/health"),
  transactions: () => json<TransactionRecord[]>("/api/transactions"),
  audit: () => json<{ entries: AuditEntry[] }>("/api/audit"),
  submit: (instruction: string, extra: { transaction_id?: string; nonce?: string } = {}) =>
    json<TransactionRecord>("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction, ...extra }),
    }),
};

/** 289900 -> "₹2,899.00", matching the server's own formatting. */
export function formatPaise(paise: number): string {
  const rupees = Math.trunc(Math.abs(paise) / 100);
  const fraction = String(Math.abs(paise) % 100).padStart(2, "0");
  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${paise < 0 ? "-" : ""}₹${grouped}.${fraction}`;
}

export function shortHash(hash: string): string {
  const bare = hash.replace(/^sha256:/, "");
  return `${bare.slice(0, 8)}…${bare.slice(-6)}`;
}
