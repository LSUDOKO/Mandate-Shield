# Mandate Shield: Benchmark Results

Generated from a deterministic 50-transaction batch (50 evaluated).
Reproduce with `npm run benchmark`. The batch is seeded, so these numbers are byte-stable.

## Composition

| Group | Count |
|---|---|
| Legitimate transactions | 35 |
| Attack transactions | 15 |

## Confusion matrix

A *positive* is a transaction the system blocked.

| | Predicted BLOCK | Predicted PASS |
|---|---|---|
| **Actually an attack** | 15 (TP) | 0 (FN) |
| **Actually legitimate** | 0 (FP) | 35 (TN) |

## Metrics

| Metric | Value |
|---|---|
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| Accuracy | 100.0% |

## Detection by threat class

| Threat class | Attacks | Blocked | Detection rate |
|---|---|---|---|
| wysiwys | 3 | 3 | 100.0% |
| field_completeness | 3 | 3 | 100.0% |
| catalog_injection | 3 | 3 | 100.0% |
| replay | 3 | 3 | 100.0% |
| actor_spoofing | 3 | 3 | 100.0% |

## Errors

**False negatives: none.** Every simulated attack was blocked.

**False positives: none.** Every legitimate transaction passed.

## False-positive cost, in business terms

The two error types are not symmetric, and the system is deliberately tuned toward the cheaper one.

- **A false positive** bounces a real customer's purchase to a Razorpay Payment Link, where they complete
  it with a normal UPI PIN or OTP. The purchase still happens; the customer absorbs added friction and the
  merchant risks some cart abandonment. Annoying, measurable, recoverable.
- **A false negative** is an unauthorized charge: money moves for something the user never agreed to. The
  cost is the transaction value plus chargeback handling, support load, and trust damage that no refund undoes.

Because a false negative is strictly worse, every check fails closed: ambiguity blocks rather than passes.
That is also why a non-zero false-positive rate is an acceptable operating point, while a non-zero false-
negative rate is a defect to be fixed.

## Scope

These 5 threat classes are drawn from the 48 catalogued in *Beyond the Mandate: A Systematic Security
Analysis of the Agent Payments Protocol (AP2)* (arXiv:2608.23858). They were chosen for being concrete and
directly relevant to a Razorpay-style mandate flow, not because the other 43 do not matter.
