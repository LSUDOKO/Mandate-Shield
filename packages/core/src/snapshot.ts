import { hashObject } from "./canonical.js";
import type { DraftOrder, StateSnapshot } from "./types.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** The exact content the hash covers — everything except the hash itself. */
function hashableContent(snapshot: Omit<StateSnapshot, "snapshot_hash">) {
  return {
    created_at: snapshot.created_at,
    transaction_id: snapshot.transaction_id,
    nonce: snapshot.nonce,
    user_intent: snapshot.user_intent,
    cart: snapshot.cart,
    rendered_view: snapshot.rendered_view,
    raw_payload_for_signing: snapshot.raw_payload_for_signing,
    actor: snapshot.actor,
    field_provenance: snapshot.field_provenance,
  };
}

/**
 * The TOCTOU fix.
 *
 * Taken ONCE, immediately after the agent drafts an order. Both the
 * human-approval view and the deterministic verifier read this object, and
 * neither re-queries any live source afterwards. If a merchant changes a price
 * after this point it simply has no effect on this transaction — it triggers a
 * fresh snapshot and a fresh approval cycle instead of silently drifting.
 */
export function createSnapshot(draft: DraftOrder, createdAt: string): StateSnapshot {
  const content = {
    created_at: createdAt,
    transaction_id: draft.transaction_id,
    nonce: draft.nonce,
    user_intent: structuredClone(draft.user_intent),
    cart: structuredClone(draft.cart),
    rendered_view: structuredClone(draft.rendered_view),
    raw_payload_for_signing: structuredClone(draft.raw_payload_for_signing),
    actor: structuredClone(draft.actor),
    field_provenance: structuredClone(draft.field_provenance),
  };

  return deepFreeze({ ...content, snapshot_hash: hashObject(hashableContent(content)) });
}

/** Recomputes the hash and compares. False means the contents changed after sealing. */
export function verifySnapshotHash(snapshot: StateSnapshot): boolean {
  return hashObject(hashableContent(snapshot)) === snapshot.snapshot_hash;
}

export function isSnapshotExpired(snapshot: StateSnapshot, now: string, ttlSeconds: number): boolean {
  const ageMs = Date.parse(now) - Date.parse(snapshot.created_at);
  return ageMs > ttlSeconds * 1000;
}
