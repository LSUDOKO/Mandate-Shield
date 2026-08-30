/**
 * Mandate Shield — deterministic verification engine.
 *
 * Public surface for every other package. Nothing exported here calls a model,
 * touches the network, or reads the clock.
 */
export * from "./types.js";
export * from "./canonical.js";
export * from "./snapshot.js";
export * from "./policy.js";
export * from "./verifier.js";

export { wysiwysCheck, parseDisplayAmountToPaise, formatPaiseAsDisplay } from "./checks/wysiwys.js";
export { fieldCompletenessCheck } from "./checks/fieldCompleteness.js";
export {
  catalogSegregationCheck,
  scanForAuthorizationClaims,
  AUTHORIZATION_CLAIM_PATTERNS,
} from "./checks/catalogSegregation.js";
export { replayCheck, InMemoryReplayLedger } from "./checks/replayLedger.js";
export { actorIdentityCheck, signActorClaim, PERMISSION_MATRIX } from "./checks/actorIdentity.js";
