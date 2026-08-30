/**
 * Shared data models for the Mandate Shield verification engine.
 *
 * Nothing in this package may import an AI SDK, reach the network, or read the
 * clock. Time and the replay ledger arrive through `VerificationContext` so
 * every check stays a pure function of its inputs.
 */

/**
 * Where a field's value came from.
 *
 * This is the mechanism that makes Checks 2 and 3 decidable rather than
 * heuristic: provenance is recorded at construction time by the parser, never
 * inferred after the fact.
 */
export type FieldSource = "user_explicit" | "policy_default" | "catalog" | "agent_inferred";

export type ActorRole = "shopping_agent" | "merchant_agent" | "credentials_provider";

export const ACTOR_ROLES: readonly ActorRole[] = [
  "shopping_agent",
  "merchant_agent",
  "credentials_provider",
] as const;

/** Operations an actor may attempt. Used by the Check 5 permission matrix. */
export type Operation =
  | "create_draft_order"
  | "request_verification"
  | "submit_catalog"
  | "confirm_fulfilment"
  | "sign_mandate"
  | "execute_payment";

/** Fields whose value materially affects cost or authorization scope. */
export const SCOPE_AFFECTING_FIELDS = ["merchant_id", "amount_paise", "currency"] as const;
export type ScopeAffectingField = (typeof SCOPE_AFFECTING_FIELDS)[number];

export function isScopeAffecting(field: string): field is ScopeAffectingField {
  return (SCOPE_AFFECTING_FIELDS as readonly string[]).includes(field);
}

export interface CartItem {
  sku: string;
  name: string;
  unit_price_paise: number;
  qty: number;
  /** Always "catalog" for agent-sourced items; recorded so Check 3 can reason about it. */
  source: "catalog";
}

export interface Cart {
  merchant_id: string;
  items: CartItem[];
  total_paise: number;
  currency: string;
}

export interface IntentConstraints {
  max_amount_paise?: number;
  currency?: string;
  merchant_id?: string;
  item_category?: string;
}

export interface UserIntent {
  instruction: string;
  /** Constraint names the user stated outright — not ones the agent guessed. */
  explicit_fields: string[];
  constraints: IntentConstraints;
}

/** Exactly what the human approver is shown. */
export interface RenderedView {
  display_total: string;
  display_merchant: string;
  display_items: string[];
}

/** Exactly what gets cryptographically signed. */
export interface SigningPayload {
  merchant_id: string;
  amount_paise: number;
  currency: string;
}

export interface ActorClaim {
  role: ActorRole;
  agent_id: string;
  /** HMAC-SHA256 over `role|agent_id|transaction_id`. */
  signature: string;
}

export type FieldProvenance = Record<string, FieldSource>;

/** What the agent produces. Treated as untrusted input by the verifier. */
export interface DraftOrder {
  transaction_id: string;
  nonce: string;
  user_intent: UserIntent;
  cart: Cart;
  rendered_view: RenderedView;
  raw_payload_for_signing: SigningPayload;
  actor: ActorClaim;
  field_provenance: FieldProvenance;
}

/**
 * The TOCTOU fix: one immutable, hashed object holding both the rendered view
 * and the signing payload. The approval step and the verifier both read this
 * exact object; neither re-queries any live source.
 */
export interface StateSnapshot {
  snapshot_hash: string;
  created_at: string;
  transaction_id: string;
  nonce: string;
  user_intent: UserIntent;
  cart: Cart;
  rendered_view: RenderedView;
  raw_payload_for_signing: SigningPayload;
  actor: ActorClaim;
  field_provenance: FieldProvenance;
}

export interface CheckResult {
  check: string;
  passed: boolean;
  reason: string;
  /** Threat IDs from arXiv:2608.23858 that this check defends against. */
  threat_ids: string[];
}

export interface Verdict {
  decision: "PASS" | "BLOCK";
  snapshot_hash: string;
  transaction_id: string;
  results: CheckResult[];
  failed_checks: string[];
  reason: string;
}

export interface AuditEntry {
  entry_id: string;
  transaction_id: string;
  timestamp: string;
  decision: "PASS" | "BLOCK";
  failed_checks: string[];
  reason: string;
  snapshot_hash: string;
  prev_entry_hash: string;
  entry_hash: string;
}

/** Injected into Check 4 so the check itself stays pure and unit-testable. */
export interface ReplayLedger {
  hasNonce(nonce: string): boolean;
  recordNonce(nonce: string, transactionId: string, seenAt: string): void;
}

/**
 * Everything a check needs beyond the snapshot. Time is injected rather than
 * read from the clock, which is what keeps verification reproducible.
 */
export interface VerificationContext {
  operation: Operation;
  now: string;
  ledger: ReplayLedger;
  actorHmacSecret: string;
}
