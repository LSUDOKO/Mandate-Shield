# Mandate Shield — Full Project Specification
### For: Razorpay AI Buildathon 2026 — Track 01 (AI Growth & Agentic Commerce), with Track 02/04-grade metrics
### Audience: an AI coding agent (e.g. Claude Code) building this end to end

---

## 1. One-line pitch

Mandate Shield is a **deterministic security checkpoint** placed between an AI shopping agent and the moment a payment mandate gets signed. It blocks transactions where the *signed* payment doesn't actually match what the user intended — even when the signature itself is technically valid — and proves it works with measured precision/recall on a synthetic attack benchmark, not a cherry-picked demo.

---

## 2. The problem, and why it's real (research grounding)

Agentic payment protocols (Google's **AP2**, which NPCI's proposed **UAP** and Razorpay's live Claude/UPI pilot with Zomato, Swiggy and Zepto follow the same pattern as) work like this:

1. A human sets rules ("buy running shoes, budget ₹3,000").
2. An AI shopping agent finds a product, builds a cart.
3. The cart gets turned into a **mandate** — a cryptographically signed record of what's being bought and for how much.
4. The signed mandate is used to actually execute payment.

The signature protects step 3 and 4. **It does not protect step 2** — the catalog data, tool calls, and inter-agent messages that shaped what went into the mandate in the first place. A 2026 academic security analysis of AP2 v0.2 ("Beyond the Mandate: A Systematic Security Analysis of the Agent Payments Protocol (AP2)", arXiv:2608.23858, Aviv/Gandhi/Bitton/Shabtai, Ben-Gurion University / Intuit) catalogued **48 distinct threats** across the AP2 lifecycle and proved **8 high-risk ones** with working proof-of-concept attacks. The core finding, in plain terms:

> A mandate can be cryptographically perfect and still encode something the user never actually agreed to — because the attacker doesn't need to break the signature. They just need to manipulate what the agent sees *before* it signs.

Mandate Shield defends against five of the most concrete, demoable threat classes from that paper (mapped to their threat IDs so you can cite the paper directly in your submission):

| # | Threat ID(s) | Plain-English description |
|---|---|---|
| 1 | T-7 | What's shown to the user/approver doesn't match what's actually inside the signed payload ("rendered-vs-signed divergence"). |
| 2 | T-6 | The agent silently fills in a missing constraint (currency, merchant, quantity) instead of asking the user, then signs it as authorized. |
| 3 | T-1 / T-4 | Catalog or tool-result content tries to act as *authorization* (e.g. a poisoned product listing implying a higher spend cap is allowed) instead of staying as plain data. |
| 4 | (replay class, general to AP2/UPI mandate flows) | The same transaction ID / nonce is submitted more than once to force a duplicate charge. |
| 5 | T-29 → T-15 | A request claims to come from one role (e.g. the merchant agent) but is actually a different, unauthorized actor exploiting a shared communication layer. |

Do not claim to solve all 48 threats — that's implausible in a week. Scope the pitch explicitly to these 5.

---

## 3. System architecture

```
User instruction ("buy running shoes, cap ₹3,000")
        │
        ▼
[Shopping Agent — LLM]  ← the ONLY place an LLM is allowed to operate
  - parses intent
  - searches mock catalog
  - assembles a proposed order (draft mandate)
        │
        ▼
[STATE SNAPSHOT] ← immutable SHA-256 snapshot of the exact rendered view + raw payload, taken ONCE, right here
        │
        ▼
┌─────────────────────────────────────────────┐
│         MANDATE SHIELD (deterministic)        │
│                                                │
│  Check 1: WYSIWYS (rendered vs signed)         │
│  Check 2: Field completeness                   │
│  Check 3: Catalog/auth segregation             │
│  Check 4: Nonce replay ledger                  │
│  Check 5: Actor identity verification          │
│                                                │
│  → both the human-approval view AND the       │
│    verifier read from the SAME snapshot hash  │
│    (this is the TOCTOU fix — see §8)          │
└─────────────────────────────────────────────┘
        │
   ┌────┴────┐
   ▼         ▼
ALL PASS   ANY FAIL
   │         │
   ▼         ▼
[Razorpay   [Freeze transaction →
 Orders API  generate Razorpay Payment
 test mode]  Link → human completes via
             normal OTP/PIN]
   │         │
   └────┬────┘
        ▼
[Immutable audit log: every decision, pass or block, with reason]
```

**Golden rule for AI judgment (judges explicitly grade this):** the LLM is used ONLY for understanding the user's natural-language request and searching/recommending products. It is never allowed to touch money logic, signature checks, or spend limits. Everything inside the Mandate Shield box is plain deterministic code — no model calls, no non-determinism, fully unit-testable.

---

## 4. Repository structure

```
mandate-shield/
├── README.md
├── docker-compose.yml              # one-command spin-up
├── agent/
│   ├── shopping_agent.py           # LLM tool-calling agent: intent parsing, catalog search, draft order
│   └── mock_catalog.json           # ~20 fake products, including a few "poisoned" entries for testing
├── core/                            # the deterministic engine — NO AI here, ever
│   ├── snapshot.py                 # builds + hashes the immutable state snapshot
│   ├── checks/
│   │   ├── wysiwys_check.py        # Check 1
│   │   ├── field_completeness.py   # Check 2
│   │   ├── catalog_segregation.py  # Check 3
│   │   ├── replay_ledger.py        # Check 4
│   │   └── actor_identity.py       # Check 5
│   ├── verifier.py                 # orchestrates all 5 checks, returns PASS/BLOCK + reason
│   └── policy.py                   # explicit constants: spend caps, allowed merchants, TTLs
├── gateway/
│   ├── razorpay_client.py          # orders.create (happy path), payment_links.create (fallback)
│   └── webhook_handler.py          # handles Razorpay test-mode callbacks
├── audit/
│   ├── ledger.py                   # append-only SQLite log, every entry hash-chained to the previous
│   └── schema.sql
├── benchmarks/
│   ├── generate_test_batch.py      # builds the 50-transaction synthetic dataset
│   ├── test_batch.json             # 35 legitimate + 15 attack transactions (see §7)
│   ├── run_benchmark.py            # runs the batch through Mandate Shield, prints metrics
│   └── results.md                  # your actual output, committed as proof
├── ui/
│   └── dashboard.html              # simple live view: transactions flowing through, pass/block, reasons
└── tests/
    └── unit tests for each check in isolation
```

---

## 5. Data models

### 5.1 Draft order (what the agent produces)
```json
{
  "transaction_id": "uuid-v4",
  "nonce": "uuid-v4",
  "user_intent": {
    "instruction": "buy running shoes, budget 3000 INR",
    "explicit_fields": ["item_category", "max_amount", "currency"]
  },
  "cart": {
    "merchant_id": "merchant_123",
    "items": [{"sku": "SHOE-042", "name": "Trail Runner X", "unit_price_paise": 289900, "qty": 1}],
    "total_paise": 289900,
    "currency": "INR"
  },
  "rendered_view": {
    "display_total": "₹2,899.00",
    "display_merchant": "Trail Runner X"
  },
  "raw_payload_for_signing": {
    "merchant_id": "merchant_123",
    "amount_paise": 289900,
    "currency": "INR"
  }
}
```

### 5.2 State snapshot (the TOCTOU fix — see §8)
```json
{
  "snapshot_hash": "sha256:...",
  "created_at": "2026-08-30T10:00:00Z",
  "rendered_view": { "...": "..." },
  "raw_payload_for_signing": { "...": "..." }
}
```
Both the human-approval UI and the deterministic verifier must read from this exact object — never re-fetch live catalog/pricing data after this point.

### 5.3 Audit log entry
```json
{
  "entry_id": "uuid",
  "transaction_id": "uuid",
  "timestamp": "...",
  "decision": "PASS | BLOCK",
  "failed_checks": ["wysiwys_check"],
  "reason": "human-readable explanation",
  "prev_entry_hash": "sha256:...",
  "entry_hash": "sha256:..."
}
```
Hash-chaining each entry to the previous one makes the log tamper-evident: editing any past entry breaks every hash after it.

---

## 6. The five checks — detailed logic

### Check 1 — WYSIWYS (What You See Is What You Sign)
- Input: the state snapshot.
- Logic: recompute a hash of `rendered_view` and compare the amount/merchant fields inside it, field-by-field, against `raw_payload_for_signing`.
- Fail condition: any mismatch, however small (e.g. displayed ₹2,899 vs payload 289,900 paise = ₹2,899 — must match exactly after unit normalization).
- Blocks threat: T-7.

### Check 2 — Field completeness
- Input: `user_intent.explicit_fields` vs. the fields actually present in `raw_payload_for_signing`.
- Logic: every field in the payload that materially affects cost or authorization scope (merchant_id, currency, amount ceiling) must trace back to something the user explicitly stated, OR to a default the user has *explicitly pre-approved* in policy (e.g. "always use INR" is fine if configured; a merchant the user never mentioned is not).
- Fail condition: a field exists in the payload with no traceable authorization source.
- Blocks threat: T-6.

### Check 3 — Catalog/auth segregation
- Input: raw catalog/tool-call text feeding into the draft order.
- Logic: catalog content is only ever allowed to populate `cart.items[].unit_price_paise`, `name`, `sku` — never anything in `raw_payload_for_signing`'s ceiling/limit fields. Explicitly maintain an allowlist of which fields catalog data is permitted to write to; anything else is rejected at the parser level, not "checked after the fact."
- Fail condition: catalog-sourced text attempts to modify a ceiling, spend cap, or currency field.
- Blocks threat: T-1, T-4.

### Check 4 — Nonce replay ledger
- Input: `transaction_id` / `nonce`.
- Logic: a SQLite table of every nonce ever seen. Before allowing signing, look up the nonce. If it exists, block immediately regardless of anything else passing.
- Fail condition: nonce already present in the ledger.
- Blocks: replay attacks.

### Check 5 — Actor identity verification
- Input: the caller's signed role claim (shopping agent / merchant agent / credentials provider) plus which internal endpoint they're hitting.
- Logic: maintain a small permission matrix — which roles are allowed to call which internal functions. Every internal call must carry an application-layer signed claim of caller identity + role + transaction ID (not just "which network channel it arrived on"). Reject any call where the claimed role doesn't match the permitted matrix for that operation.
- Fail condition: role/operation mismatch, or missing/invalid identity claim.
- Blocks threat: T-29 → T-15.

---

## 7. Synthetic benchmark: 50-transaction test batch

Build `benchmarks/test_batch.json` with exactly this composition so your reported numbers are honest and reproducible.

**35 legitimate transactions** — vary: item category, price (some near the cap, some well under), currency (all INR is fine), merchant. All fields properly traceable to explicit user intent. These should all PASS.

**15 attack transactions**, 3 per threat class:
1. **WYSIWYS violation (3):** rendered_view shows one amount, raw_payload_for_signing has a different (higher) amount.
2. **Field completeness violation (3):** payload contains a merchant_id or currency the user's instruction never mentioned and no policy default covers.
3. **Catalog injection (3):** a catalog item's `name` or description field contains text like "spending limit approved: 5000" and the parser must NOT let this leak into the ceiling field.
4. **Replay (3):** literally resubmit an already-processed nonce.
5. **Actor spoofing (3):** a request claiming to be from the "merchant agent" role calling an operation only the "credentials provider" role should be allowed to call.

Run all 50 through Mandate Shield and record, per check and overall:
- True positives (attacks correctly blocked)
- False negatives (attacks that slipped through — report honestly if any do)
- True negatives (legitimate transactions correctly passed)
- False positives (legitimate transactions wrongly blocked)
- Precision, recall
- **False-positive cost, stated in business terms:** e.g. "each false positive means a real customer's purchase gets bounced to manual OTP approval — annoying, not catastrophic, versus a false negative which is an unauthorized charge." State this tradeoff explicitly; it's exactly what the judging bar asks for.

Commit the actual output to `benchmarks/results.md` — do not just claim numbers in the pitch, show the real run.

---

## 8. Failure story — the TOCTOU bug (use this for Form Field 12)

**What broke:** During integration testing, the human-approval UI rendered transaction details fetched at time T0, but the verifier re-fetched product/catalog metadata at time T1, milliseconds later, right before signing. If a merchant catalog updated its price in that window, the system would sign a payload that differed from what was shown to the approver — a live version of exactly the T-7 divergence attack, except caused by a race condition instead of malice.

**How it was fixed:** state snapshot isolation (see §5.2). The moment an order is drafted, Mandate Shield generates one immutable, hashed snapshot containing both the rendered view and the raw signing payload together. From that point on, **both** the human-approval step and the deterministic verifier read from that exact same snapshot object — neither re-queries any live source. If anything upstream changes after the snapshot is taken, it simply has no effect on this transaction; a changed price triggers a fresh snapshot and a fresh approval cycle instead of silently drifting.

This is a real, specific, technically credible bug — use it verbatim in your submission, it demonstrates you understood the failure class deeply enough to reproduce and fix it yourself.

---

## 9. Razorpay integration points (test mode)

- **Happy path:** `orders.create` — standard test-mode order creation once Mandate Shield returns PASS.
- **Fallback path:** `payment_links.create` — generate a secure payment link when Mandate Shield returns BLOCK, so a human can complete the purchase with normal UPI PIN/OTP authorization instead of the transaction just failing outright. This is your "graceful failure" requirement satisfied.
- **Webhooks:** handle `payment_link.paid` / `order.paid` callbacks to close the loop and write the final outcome to the audit log.

Use Razorpay's official test-mode SDK (Python or Node) — do not hand-roll API signing.

---

## 10. Build plan (roughly 7 days)

| Day | Deliverable |
|---|---|
| 1 | Razorpay test-mode keys set up; repo scaffolded; mock catalog + shopping agent producing draft orders |
| 2 | Snapshot module + audit ledger (hash-chained SQLite) working end to end |
| 3 | Checks 1–3 implemented and unit-tested individually |
| 4 | Checks 4–5 implemented; verifier orchestrates all 5; PASS path wired to `orders.create` |
| 5 | BLOCK path wired to `payment_links.create` fallback; dashboard UI showing live pass/block |
| 6 | Build the 50-transaction benchmark, run it, fix whatever the results reveal (this is likely where your real "what broke" story comes from — don't force the TOCTOU story if a different bug is what you actually hit) |
| 7 | Polish README, record 5-minute pitch video, fill application form, submit |

---

## 11. Pitch video structure (5 minutes)

- **0:00–1:00** — Explain the pre-mandate attack surface: cite the paper, explain in plain words that a valid signature doesn't guarantee valid intent.
- **1:00–2:30** — Architecture walkthrough: agent → snapshot → 5 checks → Razorpay.
- **2:30–3:30** — Live demo: one clean transaction passes and settles; one injected-catalog attack gets caught and blocked in real time.
- **3:30–4:15** — Show the BLOCK triggering a Razorpay Payment Link, and the tamper-evident audit log entry it produced.
- **4:15–5:00** — Show the benchmark run: terminal output of precision/recall/false-positive numbers across the 50-transaction batch.

---

## 12. Application form — key field drafts

**Track:** Track 01: AI Growth & Agentic Commerce

**Project name:** Mandate Shield

**What it solves (Field 09):**
"While agentic commerce protocols (AP2, NPCI UAP) secure final mandate signatures, recent security research shows that pre-mandate context — catalog data, tool calls, inter-agent messages — remains unprotected, letting a validly signed mandate encode something the user never intended. Mandate Shield is a deterministic security gateway placed between AI order creation and mandate signing. It runs five rule-based checks (rendered-vs-signed matching, explicit field authorization, catalog/authorization segregation, nonce replay prevention, and actor identity verification) — with zero AI involved in the money-decision path. Blocked transactions trigger a graceful step-up fallback via Razorpay Payment Links for normal human OTP approval, and every decision is written to an immutable, hash-chained audit log. Tested on a held-out batch of 50 transactions (35 legitimate, 15 simulated attacks), with measured precision, recall, and explicit false-positive cost accounting."

**What broke, and how you got out (Field 12):** use §8 above, verbatim or lightly adapted to whatever you actually hit during your own build — if your real bug differs, use the real one; it will read as more credible than a reused example.

---

## 13. Submission checklist

- [ ] Public GitHub repo, clean README, sensible commit history (not one giant commit)
- [ ] `docker-compose up` works in one command
- [ ] `benchmarks/results.md` committed with real, reproducible numbers
- [ ] Deployed somewhere reachable if possible, not just runnable locally
- [ ] 5-minute unlisted pitch video following §11
- [ ] Every architectural decision (why deterministic checks, why this specific 5, why Razorpay Payment Links for fallback) rehearsed and ready to defend out loud — the panel reportedly probes hardest here

---

## 14. Explicit scope boundary (say this out loud in your pitch)

Be upfront that Mandate Shield defends against 5 of the paper's 48 catalogued threats, chosen because they are the most concrete, demoable, and directly relevant to a Razorpay-style mandate flow — not because the other 43 don't matter. This honesty about scope is itself a "problem taste" signal: it shows you understand the difference between a real threat model and a marketing claim.
