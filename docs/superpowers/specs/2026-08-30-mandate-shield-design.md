# Mandate Shield — Design Specification

**Date:** 2026-08-30
**Target:** Razorpay AI Buildathon 2026, Track 01 (AI Growth & Agentic Commerce)
**Source plan:** `mandate-shield-project-plan.md`

---

## 1. Purpose

Mandate Shield is a deterministic security checkpoint that sits between an AI shopping
agent and the moment a payment mandate is signed. It blocks transactions where the
*signed* payload does not match what the user actually intended — even when the
cryptographic signature is valid.

The system defends against five threat classes drawn from *"Beyond the Mandate: A
Systematic Security Analysis of the Agent Payments Protocol (AP2)"* (arXiv:2608.23858).
It explicitly does **not** claim to address all 48 threats catalogued in that paper.

| Check | Threat ID(s) | Defends against |
|---|---|---|
| 1. WYSIWYS | T-7 | Rendered view diverges from signed payload |
| 2. Field completeness | T-6 | Agent silently invents an unauthorized constraint |
| 3. Catalog/auth segregation | T-1 / T-4 | Catalog text acting as authorization |
| 4. Nonce replay ledger | replay class | Duplicate charge via resubmitted nonce |
| 5. Actor identity | T-29 → T-15 | Caller claims a role it does not hold |

## 2. Governing constraint

**The LLM is confined to one place.** Groq powers only natural-language intent parsing
and catalog search/recommendation. It never touches money logic, signature checks, or
spend limits. Every line of code inside the Mandate Shield verification boundary is
plain deterministic TypeScript: no model calls, no network I/O, no clock-dependent
branching, fully unit-testable.

This is enforced structurally, not by convention: `packages/core` declares zero
dependencies on `packages/agent` or on any AI SDK. A dependency-direction test asserts
this and fails the build if violated.

## 3. Stack decisions

| Concern | Decision | Rationale |
|---|---|---|
| Language | TypeScript (Node 22), npm workspaces | Requested; pairs with Razorpay Node SDK |
| Agent LLM | Groq (`llama-3.3-70b-versatile`) via `groq-sdk` | Requested; fast, tool-calling capable |
| Payments | Razorpay Node SDK, test mode | Real `orders.create` / `payment_links.create` |
| Persistence | SQLite via `better-sqlite3` | Synchronous, zero-config, suits hash-chained append-only log |
| Dashboard | React + Vite + TypeScript | Live pass/block feed, metrics, audit viewer |
| Tests | Vitest | Fast, TS-native, workspace-aware |
| Delivery | docker-compose + npm scripts + deploy config | Submission checklist requires one-command spin-up |

### Graceful degradation (no-keys mode)

The repository must clone-and-run with zero API keys so judges and CI can execute the
benchmark. Two components have live/offline modes; the deterministic core has neither
(it is always deterministic).

- **Agent:** `GROQ_API_KEY` present → real Groq tool-calling. Absent → deterministic
  rule-based intent parser producing the same `DraftOrder` shape.
- **Gateway:** Razorpay keys present → real test-mode API calls. Absent → in-process
  mock returning realistic order/payment-link objects.

Mode is reported in the API health endpoint and on the dashboard so nothing is
misrepresented as live when it is not.

## 4. Architecture

```
User instruction ("buy running shoes, cap ₹3,000")
        │
        ▼
[Shopping Agent — Groq]        ← the ONLY place an LLM operates
  parses intent → searches mock catalog → assembles DraftOrder
        │
        ▼
[STATE SNAPSHOT]               ← immutable SHA-256 snapshot, taken ONCE, here
        │
        ▼
┌──────────────────────────────────────────────┐
│   MANDATE SHIELD (deterministic, no AI)      │
│   Check 1 WYSIWYS                            │
│   Check 2 Field completeness                 │
│   Check 3 Catalog/auth segregation           │
│   Check 4 Nonce replay ledger                │
│   Check 5 Actor identity                     │
│   Both the approval view and the verifier    │
│   read the SAME snapshot hash (TOCTOU fix)   │
└──────────────────────────────────────────────┘
        │
   ┌────┴────┐
   ▼         ▼
ALL PASS   ANY FAIL
   │         │
   ▼         ▼
Razorpay   Razorpay Payment Link
orders     (human completes via OTP/PIN)
   │         │
   └────┬────┘
        ▼
[Hash-chained append-only audit log]
```

### Module boundaries

- **`packages/core`** — the verification engine. Pure functions. Input: a
  `StateSnapshot` plus a `VerificationContext`. Output: a `Verdict`. The only
  impure dependency is the replay ledger, which is injected as an interface so
  checks stay unit-testable with an in-memory fake.
- **`packages/agent`** — produces `DraftOrder` objects. Output is treated as
  **untrusted input** by core.
- **`packages/gateway`** — Razorpay wrapper. Called only after a verdict exists.
- **`packages/audit`** — hash-chained SQLite ledger; append-only, tamper-evident.
- **`packages/server`** — Express API composing the above; serves the dashboard.
- **`packages/benchmarks`** — generates and runs the 50-transaction batch.
- **`apps/dashboard`** — React + Vite UI.

## 5. Data models

### 5.1 DraftOrder (agent output, untrusted)

```ts
interface DraftOrder {
  transaction_id: string;          // uuid v4
  nonce: string;                   // uuid v4
  user_intent: {
    instruction: string;
    explicit_fields: string[];     // e.g. ["item_category","max_amount","currency"]
    constraints: {                 // parsed, still untrusted
      max_amount_paise?: number;
      currency?: string;
      merchant_id?: string;
      item_category?: string;
    };
  };
  cart: {
    merchant_id: string;
    items: CartItem[];             // sku, name, unit_price_paise, qty, source: "catalog"
    total_paise: number;
    currency: string;
  };
  rendered_view: {                 // exactly what the human is shown
    display_total: string;         // "₹2,899.00"
    display_merchant: string;
    display_items: string[];
  };
  raw_payload_for_signing: {       // exactly what gets signed
    merchant_id: string;
    amount_paise: number;
    currency: string;
  };
  actor: {                         // application-layer identity claim
    role: "shopping_agent" | "merchant_agent" | "credentials_provider";
    agent_id: string;
    signature: string;             // HMAC over (role|agent_id|transaction_id)
  };
  field_provenance: Record<string, "user_explicit" | "policy_default" | "catalog" | "agent_inferred">;
}
```

`field_provenance` is the mechanism that makes Checks 2 and 3 decidable rather than
heuristic: every field carries a recorded origin, assigned at construction time by the
parser, not inferred after the fact.

### 5.2 StateSnapshot (the TOCTOU fix)

```ts
interface StateSnapshot {
  snapshot_hash: string;           // "sha256:..." over canonicalized content
  created_at: string;              // ISO-8601
  transaction_id: string;
  nonce: string;
  rendered_view: RenderedView;
  raw_payload_for_signing: SigningPayload;
  cart: Cart;
  user_intent: UserIntent;
  actor: ActorClaim;
  field_provenance: Record<string, FieldSource>;
}
```

Hashing uses a canonical JSON serializer (recursively sorted keys, no whitespace) so
the hash is stable and reproducible. Once created the object is deep-frozen. Both the
approval UI and the verifier read this exact object; neither re-queries any live
source.

### 5.3 Audit log entry

```ts
interface AuditEntry {
  entry_id: string;
  transaction_id: string;
  timestamp: string;
  decision: "PASS" | "BLOCK";
  failed_checks: string[];
  reason: string;
  snapshot_hash: string;
  prev_entry_hash: string;
  entry_hash: string;              // sha256 over all preceding fields
}
```

Editing any past entry breaks every subsequent hash. `verifyChain()` walks the log and
returns the first index where the chain breaks, or `null` if intact.

## 6. The five checks

Each check is a pure function `(snapshot, context) => CheckResult` where
`CheckResult = { check: string; passed: boolean; reason: string; threat_ids: string[] }`.

### Check 1 — WYSIWYS
Normalizes `rendered_view.display_total` (strips ₹, commas; parses rupees → paise) and
compares field-by-field against `raw_payload_for_signing.amount_paise`. Also compares
displayed merchant against payload merchant, and asserts cart total equals payload
amount. **Fails on any mismatch, however small.**

### Check 2 — Field completeness
For every field in `raw_payload_for_signing` that materially affects cost or
authorization scope (`merchant_id`, `currency`, `amount_paise`), the recorded
provenance must be `user_explicit` or `policy_default` **and** the value must be
permitted by policy (allowed-merchant list, allowed-currency list, spend cap).
Provenance of `agent_inferred` on a scope-affecting field fails.

### Check 3 — Catalog/auth segregation
Two layers:
1. **Parser-level allowlist (primary):** catalog data may only ever write to
   `cart.items[].sku`, `.name`, `.unit_price_paise`, `.qty`. The agent's construction
   path enforces this; anything else is rejected before the draft is built.
2. **Verification-level assertion (defence in depth):** any field in
   `raw_payload_for_signing` whose provenance is `catalog` fails immediately.
   Additionally, catalog-sourced strings are scanned for authorization-claiming
   patterns (e.g. `spending limit approved: 5000`, `budget increased to …`,
   `authorized up to …`) and flagged — the pattern scanner is a *reporting* aid;
   the provenance rule is what actually decides.

### Check 4 — Nonce replay ledger
SQLite table of every nonce seen. Lookup before signing; if present, block
immediately regardless of any other result. Recording is transactional and happens
only for transactions that reach a verdict, so a blocked-for-other-reasons
transaction cannot be silently retried with the same nonce.

### Check 5 — Actor identity
A permission matrix maps role → permitted operations:

| Role | Permitted operations |
|---|---|
| `shopping_agent` | `create_draft_order`, `request_verification` |
| `merchant_agent` | `submit_catalog`, `confirm_fulfilment` |
| `credentials_provider` | `sign_mandate`, `execute_payment` |

Every internal call carries an HMAC-signed claim over
`role|agent_id|transaction_id`. The check verifies the HMAC, then verifies the claimed
role is permitted for the requested operation. Missing claim, bad HMAC, or
role/operation mismatch all fail. Verification is at the application layer — never
inferred from which network channel a request arrived on.

### Orchestration
`verifier.ts` runs all five checks, collects every result (does not short-circuit — the
audit log records *all* failures, not just the first), and returns:

```ts
interface Verdict {
  decision: "PASS" | "BLOCK";
  snapshot_hash: string;
  results: CheckResult[];
  failed_checks: string[];
  reason: string;                  // human-readable summary
}
```

## 7. Policy

`policy.ts` holds explicit named constants — no magic numbers scattered through checks:
global spend cap, per-transaction cap, allowed currencies, allowed merchant IDs,
snapshot TTL, and the set of scope-affecting fields. Policy is data, so the benchmark
can assert behaviour against it directly.

## 8. Benchmark

`benchmarks/testBatch.json`: exactly 50 transactions — 35 legitimate, 15 attacks
(3 per threat class). Deterministically generated with a seeded PRNG so the batch is
reproducible.

`runBenchmark.ts` runs all 50 through the real verifier and reports, per check and
overall: true positives, false negatives, true negatives, false positives, precision,
recall, F1, and a per-threat-class breakdown. Output is committed to
`benchmarks/results.md` as real, reproducible evidence.

The report states the false-positive cost in business terms explicitly: a false
positive bounces a real customer to manual OTP approval (annoying, recoverable); a
false negative is an unauthorized charge (money moves without consent). The system is
therefore tuned to prefer false positives.

## 9. API surface

```
POST /api/transactions        Run instruction → agent → snapshot → verify → gateway
GET  /api/transactions        Recent transactions with verdicts
GET  /api/transactions/:id    Full detail incl. snapshot and per-check results
GET  /api/audit               Audit log entries
GET  /api/audit/verify        Chain integrity result
POST /api/webhooks/razorpay   payment_link.paid / order.paid callbacks
GET  /api/benchmark           Latest benchmark results
GET  /api/health              Component modes (groq: live|offline, razorpay: live|mock)
```

## 10. Dashboard

React + Vite. Four regions: live transaction feed (pass/block with reasons), a
transaction detail drawer showing the snapshot and all five check outcomes, a benchmark
metrics panel (precision/recall/confusion matrix), and an audit-log viewer with a chain
integrity indicator. An attack-simulation control lets a presenter fire each of the five
attack types on demand for the pitch video.

## 11. Testing strategy

- **Unit tests per check** — each check tested in isolation with hand-built snapshots
  covering pass, fail, and boundary cases.
- **Snapshot tests** — canonical hashing stability, deep-freeze immutability, TTL.
- **Audit tests** — chain integrity, tamper detection.
- **Architecture test** — asserts `core` imports nothing from `agent`/AI SDKs.
- **Integration tests** — full instruction → verdict → gateway flow in offline mode.
- **Benchmark as regression gate** — the 50-transaction batch runs in CI; recall on
  attacks must stay at the committed level.

## 12. Failure story (Form Field 12)

The TOCTOU race described in §8 of the source plan is the design's motivating bug: the
approval UI rendered data fetched at T0 while the verifier re-fetched catalog metadata
at T1, so a mid-window price change would produce a signed payload differing from what
the approver saw — a live T-7 divergence caused by a race rather than an attacker. The
fix is state snapshot isolation: one immutable hashed snapshot created at draft time,
read by both the approval step and the verifier, with neither re-querying any live
source. If the real build surfaces a different, more interesting bug, that one gets
reported instead.

## 13. Scope boundary

Mandate Shield addresses 5 of the 48 threats catalogued in the source paper, chosen
because they are the most concrete, demonstrable, and directly relevant to a
Razorpay-style mandate flow. This is stated plainly in the README and the pitch.
