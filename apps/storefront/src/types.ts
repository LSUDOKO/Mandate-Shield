export interface Product {
  sku: string;
  name: string;
  merchant_id: string;
  price_paise: number;
  category: string;
  description?: string;
  image_url?: string;
  rating?: number;
  in_stock?: boolean;
  /** Present on the deliberately hostile fixtures that exercise Check 3. */
  poisoned?: boolean;
}

export interface CartLine {
  product: Product;
  qty: number;
}

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
    rendered_view: { display_total: string; display_merchant: string; display_items: string[] };
    raw_payload_for_signing: { merchant_id: string; amount_paise: number; currency: string };
    field_provenance: Record<string, string>;
    cart: { items: Array<{ sku: string; name: string; unit_price_paise: number; qty: number }> };
  };
  verdict: {
    decision: "PASS" | "BLOCK";
    results: CheckResult[];
    failed_checks: string[];
    reason: string;
    snapshot_hash: string;
  };
  gateway: {
    kind: "order" | "payment_link" | "none";
    id?: string;
    short_url?: string;
    mode?: string;
    reason?: string;
    amount?: number;
  };
  audit_entry: { entry_id: string; entry_hash: string; prev_entry_hash: string };
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
  audit_persistence?: string;
}

/** The human-readable label and copy for each of the five checks. */
export const CHECK_LABELS: Record<string, { title: string; threats: string }> = {
  wysiwys: { title: "What you see is what you sign", threats: "T-7" },
  field_completeness: { title: "Field completeness", threats: "T-6" },
  catalog_segregation: { title: "Catalog segregation", threats: "T-1/T-4" },
  replay_ledger: { title: "Nonce replay", threats: "replay" },
  actor_identity: { title: "Actor identity", threats: "T-29/T-15" },
  snapshot_integrity: { title: "Snapshot integrity", threats: "T-7" },
};
