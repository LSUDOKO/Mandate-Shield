# Mandate Shield

**A deterministic security checkpoint between an AI shopping agent and the moment a payment mandate gets signed.**

Built for the Razorpay AI Buildathon 2026 — Track 01, AI Growth & Agentic Commerce.

**Live: [mandate-shield.vercel.app](https://mandate-shield.vercel.app)** · [Console](https://mandate-shield.vercel.app/#console) · [Benchmark results](packages/benchmarks/results.md)

The deployed console runs the real Groq agent and the real deterministic engine. Its audit ledger is in-memory, because serverless instances have no persistent disk; `docker compose up` runs the same system with the SQLite ledger and a durable hash chain.

It blocks transactions where the *signed* payment doesn't match what the user actually intended — even when the signature is cryptographically perfect — and proves it works with measured precision and recall on a synthetic attack benchmark, not a cherry-picked demo.

---

## The problem

Agentic payment protocols — Google's **AP2**, NPCI's proposed **UAP**, and Razorpay's live Claude/UPI pilot — all work roughly like this:

1. A human sets rules: *"buy running shoes, budget ₹3,000."*
2. An AI agent finds a product and builds a cart.
3. The cart becomes a **mandate**: a cryptographically signed record of what's being bought and for how much.
4. The signed mandate executes the payment.

The signature protects steps 3 and 4. **It does not protect step 2** — the catalog data, tool results, and inter-agent messages that decided what went into the mandate in the first place.

> A mandate can be cryptographically perfect and still encode something the user never agreed to, because the attacker doesn't need to break the signature. They only need to manipulate what the agent sees before it signs.

A 2026 security analysis of AP2 v0.2 — *["Beyond the Mandate: A Systematic Security Analysis of the Agent Payments Protocol"](https://arxiv.org/abs/2608.23858)*, Aviv, Gandhi, Bitton & Shabtai (Ben-Gurion University / Intuit) — catalogued **48 distinct threats** across the AP2 lifecycle and demonstrated 8 high-risk ones with working proof-of-concept attacks.

Mandate Shield defends against **5 of those 48**. That scope is deliberate and stated up front — see [Scope](#scope).

| # | Threat ID | What it looks like | Check |
|---|---|---|---|
| 1 | `T-7` | What the approver is shown differs from what's inside the signed payload | WYSIWYS |
| 2 | `T-6` | The agent silently fills in a missing constraint instead of asking, then signs it as authorized | Field completeness |
| 3 | `T-1` / `T-4` | Catalog text acts as *authorization* ("spending limit approved: 50000") instead of staying plain data | Catalog segregation |
| 4 | replay class | The same nonce is submitted twice to force a duplicate charge | Replay ledger |
| 5 | `T-29` → `T-15` | A request claims a role it doesn't hold | Actor identity |

---

## Results

Measured on a held-out batch of 50 transactions — 35 legitimate, 15 attacks (3 per threat class). The batch is seeded, so these numbers reproduce byte-for-byte with `npm run benchmark`.

| Metric | Value |
|---|---|
| Attacks blocked | **15 / 15** |
| Attacks missed (false negatives) | **0** |
| Legitimate passed | **35 / 35** |
| Legitimate wrongly blocked (false positives) | **0** |
| Precision | **100%** |
| Recall | **100%** |

Every attack fails *exactly* the check matching its threat class — nothing is caught incidentally by an unrelated check. The 35 legitimate transactions span ₹399 to ₹4,998 against a ₹5,000 cap, so they exercise the policy boundary rather than passing trivially.

Full breakdown: [`packages/benchmarks/results.md`](packages/benchmarks/results.md).

**A note on what these numbers mean.** 100% on a benchmark you wrote yourself is a statement about internal consistency, not about the real world. It shows the checks do what they claim against the attack classes they were built for. It does not show that they would stop a novel attack, and it must not be read that way.

---

## The governing rule

**The LLM never touches money.**

Groq is used for exactly one thing: understanding a natural-language request and searching the catalog. Everything inside the shield — every check, every comparison, every limit — is plain deterministic TypeScript. No model calls, no network I/O, no clock reads. A verdict is reproducible from its inputs alone.

This is enforced structurally, not by convention. `packages/core` declares **zero runtime dependencies**, and a test fails the build if it ever imports an AI SDK, calls `fetch`, or reads `Date.now()`:

```
packages/core/test/architecture.test.ts
  ✓ imports no AI SDK anywhere in core
  ✓ does not depend on the agent package
  ✓ declares no runtime dependencies at all in its manifest
  ✓ makes no network calls from the check path
  ✓ reads neither the clock nor the random generator inside checks
```

---

## Architecture

```
User instruction ("buy running shoes, cap ₹3,000")
        │
        ▼
┌──────────────────────────┐
│ Shopping Agent — Groq    │  ← the ONLY place an LLM operates
│ parse intent → search    │     its output is UNTRUSTED input
│ catalog → draft order    │
└──────────────────────────┘
        │
        ▼
   [STATE SNAPSHOT]  ← immutable, SHA-256 hashed, taken ONCE
        │
        ▼
┌──────────────────────────────────────────────┐
│   MANDATE SHIELD — deterministic, no AI      │
│                                              │
│   1  WYSIWYS ................. T-7           │
│   2  Field completeness ...... T-6           │
│   3  Catalog segregation ..... T-1 / T-4     │
│   4  Nonce replay ledger ..... replay        │
│   5  Actor identity .......... T-29 → T-15   │
│                                              │
│   The approval view and the verifier read    │
│   the SAME snapshot. Neither re-queries      │
│   any live source. (This is the TOCTOU fix.) │
└──────────────────────────────────────────────┘
        │
   ┌────┴─────┐
   ▼          ▼
 ALL PASS   ANY FAIL
   │          │
   ▼          ▼
Razorpay    Razorpay Payment Link
orders      → human completes with
.create       normal UPI PIN / OTP
   │          │
   └────┬─────┘
        ▼
  Hash-chained, append-only audit log
```

---

## Quick start

Nothing here needs an API key. A fresh clone runs the full suite and the benchmark:

```bash
npm install
npm test           # 163 tests
npm run build
npm run benchmark  # 50 transactions through the real verifier
```

Run the whole system:

```bash
docker compose up --build
# API       → http://localhost:3000/api/health
# Dashboard → http://localhost:5173
```

If those ports are already taken:

```bash
API_PORT=3555 DASHBOARD_PORT=5555 docker compose up --build
```

Or locally, in two terminals:

```bash
npm run dev        # API on :3000
npm run dashboard  # dashboard on :5173
```

### Adding credentials

Copy `.env.example` to `.env` and fill in whatever you have. Each component upgrades independently, and `/api/health` always reports which mode it's actually in — a mock is never presented as a live integration.

| Variable | Without it | With it |
|---|---|---|
| `GROQ_API_KEY` | Deterministic rule-based intent parser | Groq parses intent and picks products |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | In-process mock orders and links | Real Razorpay test-mode API calls |
| `RAZORPAY_WEBHOOK_SECRET` | Webhooks rejected | `payment_link.paid` / `order.paid` verified and accepted |
| `ACTOR_HMAC_SECRET` | Insecure dev default | Signs actor identity claims (Check 5) |

---

## The five checks

### 1 — WYSIWYS (What You See Is What You Sign) · `T-7`

Normalizes the rendered total (`"₹2,899.00"` → `289900` paise) and compares it field-by-field against the signing payload: amount, merchant, currency, cart total, and the sum of line items. **Any divergence blocks, down to one paise.**

Currency is formatted by hand rather than through `toLocaleString`, because a Node build without full ICU data would group digits differently and make a displayed total stop matching its signed amount — precisely the divergence this check exists to catch.

### 2 — Field completeness · `T-6`

Every field that materially affects cost or authorization scope (`merchant_id`, `amount_paise`, `currency`) must trace to something the user explicitly stated, or to a default they pre-approved in policy.

This is decidable rather than heuristic because every field carries recorded **provenance**, assigned when the draft is built:

| Provenance | Meaning | Allowed for a scope-affecting field? |
|---|---|---|
| `user_explicit` | The user stated it outright | Yes |
| `policy_default` | A default the user pre-approved | Only if policy actually lists that value |
| `agent_inferred` | The agent guessed | **No** |
| `catalog` | It came from product data | **No** |

So *"buy running shoes under 3000 INR"* — with no merchant named — blocks: the agent had to choose a merchant, that choice is marked `agent_inferred`, and a guess is not authorization.

### 3 — Catalog / authorization segregation · `T-1` / `T-4`

Catalog data may only ever populate `cart.items[].sku`, `.name`, `.unit_price_paise`, and `.qty`. Two layers:

1. **Provenance (decisive):** any signing field marked `catalog` fails immediately.
2. **Pattern scan (defence in depth):** catalog text is scanned for authorization claims — `spending limit approved: 5000`, `budget increased to …`, `ignore previous instructions`.

The agent's catalog search deliberately does **not** filter out poisoned listings. Hiding them in the agent would prevent the attack from ever reaching the check whose job is to catch it — so a test pins that behavior in place.

### 4 — Nonce replay ledger

Every nonce ever seen is recorded in SQLite. A nonce that reappears blocks immediately, regardless of what else passed. Nonces are spent once a verdict exists — pass or block — so nothing can be quietly retried.

### 5 — Actor identity · `T-29` → `T-15`

Every internal call carries an HMAC-signed claim over `role|agent_id|transaction_id`, checked against a deny-by-default permission matrix:

| Role | May perform |
|---|---|
| `shopping_agent` | `create_draft_order`, `request_verification` |
| `merchant_agent` | `submit_catalog`, `confirm_fulfilment` |
| `credentials_provider` | `sign_mandate`, `execute_payment` |

Binding the transaction ID into the HMAC stops a claim minted for one transaction being replayed onto another; binding the role stops a lower-privileged actor relabelling itself. Identity is verified at the application layer — never inferred from which network channel a request arrived on.

---

## Graceful failure

A blocked transaction is not a dead end. Mandate Shield generates a **Razorpay Payment Link** so the customer completes the purchase with a normal UPI PIN or OTP.

The agent is removed from the loop. The customer is not.

That asymmetry is the entire design rationale for the error tradeoff:

- **A false positive** bounces a real customer to manual approval. Annoying, measurable, recoverable.
- **A false negative** is an unauthorized charge. The cost is the transaction value plus chargebacks, support load, and trust damage no refund undoes.

Since a false negative is strictly worse, every check **fails closed**: ambiguity blocks. A non-zero false-positive rate is an acceptable operating point; a non-zero false-negative rate is a defect.

---

## Tamper-evident audit log

Every decision — pass or block — is appended to a SQLite log where each entry's hash covers the previous entry's hash. Editing any past row breaks every hash after it, and `GET /api/audit/verify` reports exactly where.

```json
{ "intact": true, "brokenAtIndex": null, "entryCount": 8 }
```

---

## What broke: the TOCTOU race

The approval UI rendered transaction details fetched at T0, while the verifier re-read catalog and pricing metadata at T1, milliseconds later, just before signing. If a merchant updated a price inside that window, the system would sign a payload that differed from what the approver actually saw — **a live T-7 divergence produced by a race condition rather than an attacker.**

The fix is state snapshot isolation. The moment an order is drafted, one immutable, SHA-256-hashed snapshot is created holding *both* the rendered view and the signing payload. From that point on, the approval step and the verifier read that same object and neither re-queries any live source. A price change afterwards simply has no effect on the in-flight transaction — it triggers a fresh snapshot and a fresh approval cycle instead of silently drifting.

The snapshot is deep-frozen and its hash is re-verified before any check runs, so a snapshot that changed after sealing is rejected outright.

Three smaller failures found by running the system rather than only testing it are recorded in the git history: `tsc --build` doesn't copy `schema.sql` into `dist/`, so a built server crashed on startup; the Razorpay SDK requires a `customer` field whose absence silently resolved to the wrong overload; and the catalog search couldn't match a product by name, which left the poisoned listings unreachable and the injection attack impossible to demonstrate live.

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/transactions` | Run instruction → agent → snapshot → verify → gateway |
| `GET /api/transactions` | Recent transactions with verdicts |
| `GET /api/transactions/:id` | Full detail: snapshot, all five check results, gateway outcome |
| `GET /api/audit` | Audit log entries |
| `GET /api/audit/verify` | Chain integrity |
| `POST /api/webhooks/razorpay` | Signature-verified `payment_link.paid` / `order.paid` |
| `GET /api/health` | Component modes and chain status |

```bash
curl -X POST localhost:3000/api/transactions \
  -H 'content-type: application/json' \
  -d '{"instruction":"buy running shoes from merchant_123 under 3000 INR"}'
```

---

## Repository layout

```
packages/
  core/         The verification engine. No AI, no network, no clock. Zero dependencies.
    checks/     The five checks, each a pure function
    snapshot.ts Immutable hashed state snapshot (the TOCTOU fix)
    policy.ts   Explicit spend caps and allowlists
    verifier.ts Orchestration — runs all five, never short-circuits
  agent/        Groq shopping agent + deterministic fallback. The only place an LLM runs.
  audit/        Hash-chained append-only SQLite ledger
  gateway/      Razorpay orders, payment links, webhooks
  server/       Express API composing the pipeline
  benchmarks/   50-transaction batch, metrics, committed results
apps/
  dashboard/    React + Vite operations console
```

The verifier collects **every** check result rather than stopping at the first failure, so the audit log records the complete picture of what went wrong.

---

## Scope

Mandate Shield addresses **5 of the 48 threats** catalogued in the source paper. They were chosen for being concrete, demonstrable, and directly relevant to a Razorpay-style mandate flow — not because the other 43 don't matter.

Also worth stating plainly:

- The catalog is mock data, not a real merchant integration.
- The benchmark is synthetic and self-authored. It measures the checks against attack classes they were designed for.
- Check 5 models inter-agent identity within one process. A production deployment would need real key distribution and rotation.

---

## License

MIT — see [LICENSE](LICENSE).
