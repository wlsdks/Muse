---
title: Continuity interaction longitudinal evidence audit
status: collecting
date: 2026-07-18
---

# Continuity interaction longitudinal evidence audit

## Verdict

Muse can now measure the missing life/work interaction evidence without
manufacturing product success. The shared core, CLI, and authenticated HTTP
report a conservative numeric collection gate: ten canonical exact interactions
across two distinct UTC `openedAt` dates for each kind. Numeric completion only
changes the status to `audit-required`; it cannot certify natural timing,
usefulness, causality, permission, or automation readiness.

The actual local baseline remains `collecting`. Synthetic evidence proved the
reducer at scale but was never persisted or counted as actual evidence.

## Actual local read-only result

Reproduction:

```sh
pnpm dogfood:continuity-interaction-audit:local
```

Only aggregates were retained:

| Kind | Exact | Exact target | Exact opened UTC dates | Date target | Unavailable |
| --- | ---: | ---: | ---: | ---: | ---: |
| life | 0 | 10 | 0 | 2 | 6 |
| work | 0 | 10 | 0 | 2 | 15 |
| **overall** | **0** | — | — | — | **21** |

- status: `collecting`
- Attunement existed before/after and SHA-256 was unchanged: `true`
- tasks source existed before/after and SHA-256 was unchanged: `true`
- synthetic data used: `false`
- identifying interaction/task/delivery fields retained: `false`
- permission expansion: `false`

The audit runner emits no interaction, task, delivery, thread, run, title, or
content fields. Its validator rejects such fields and verifies that a source
missing before the read is not created afterward.

## Fixed-seed synthetic stress result

Reproduction:

```sh
pnpm eval:continuity-interaction-audit
```

| Measure | Result |
| --- | ---: |
| Cohorts processed | 5,000 |
| Interaction items processed | 174,548 |
| Production vs independent-oracle mismatches | 0 |
| Outcome-contamination mismatches | 0 |
| `collecting` cohorts | 4,731 |
| `audit-required` cohorts | 269 |
| Off-by-one mutant detected | true |

The generator used fixed seed `1297437509` and ran entirely in memory. It varied
exact/non-exact states, life/work asymmetry, date coverage, threshold boundaries,
and explicit outcomes. The oracle shares no production reducer code. A separate
nine-exact-per-kind counterfactual proves the evaluator turns RED when a target is
incorrectly lowered from ten to nine.

Artifact invariants:

- classification: `synthetic-generated`
- persisted to Attunement: `false`
- natural longitudinal evidence: `false`
- permission expansion: `false`

## Interpretation

The implementation and measurement path are now reliable enough to accumulate
future evidence, but the product evidence itself is not complete. The next honest
step is to collect canonical exact interactions during distinct natural life and
work return moments. Even after the numeric target is met, a human evidence audit
must still review timing, domain diversity, comparability, usefulness, and
causality before any product or autonomy decision.
