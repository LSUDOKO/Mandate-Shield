import { createHmac, timingSafeEqual } from "node:crypto";
import { ACTOR_ROLES, type ActorRole, type CheckResult, type Operation, type StateSnapshot } from "../types.js";

const CHECK = "actor_identity";
const THREATS = ["T-29", "T-15"];

/** Which roles may perform which operations. Deny by default. */
export const PERMISSION_MATRIX: Record<ActorRole, Operation[]> = {
  shopping_agent: ["create_draft_order", "request_verification"],
  merchant_agent: ["submit_catalog", "confirm_fulfilment"],
  credentials_provider: ["sign_mandate", "execute_payment"],
};

/**
 * Application-layer identity claim. Binding the transaction id into the HMAC
 * stops a claim minted for one transaction being replayed onto another, and
 * binding the role stops a lower-privileged actor re-labelling itself.
 */
export function signActorClaim(role: string, agentId: string, transactionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${role}|${agentId}|${transactionId}`, "utf8").digest("hex");
}

function signaturesMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function fail(reason: string): CheckResult {
  return { check: CHECK, passed: false, reason, threat_ids: THREATS };
}

/**
 * Check 5 — Actor identity.
 * Identity is asserted at the application layer and verified cryptographically;
 * it is never inferred from which network channel a request arrived on.
 */
export function actorIdentityCheck(snapshot: StateSnapshot, operation: Operation, secret: string): CheckResult {
  const { role, agent_id, signature } = snapshot.actor;

  if (!signature) {
    return fail(`Actor ${agent_id} presented a missing identity signature for operation "${operation}".`);
  }

  if (!ACTOR_ROLES.includes(role)) {
    return fail(`Actor ${agent_id} claimed unrecognised role "${role}".`);
  }

  const expected = signActorClaim(role, agent_id, snapshot.transaction_id, secret);
  if (!signaturesMatch(expected, signature)) {
    return fail(`Identity signature for ${agent_id} claiming role "${role}" on transaction ${snapshot.transaction_id} failed verification.`);
  }

  const permitted = PERMISSION_MATRIX[role];
  if (!permitted.includes(operation)) {
    return fail(`Role "${role}" is not permitted to perform "${operation}". Permitted operations for that role are [${permitted.join(", ")}].`);
  }

  return {
    check: CHECK,
    passed: true,
    reason: `Actor ${agent_id} proved role "${role}", which is permitted to perform "${operation}".`,
    threat_ids: THREATS,
  };
}
