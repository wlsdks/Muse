---
title: Continuity interaction controlled shadow dogfood — 24 deliveries
status: controlled-evidence
date: 2026-07-18
---

# Continuity interaction controlled shadow dogfood — 24 deliveries

## Verdict

The canonical interaction report passed a 24-delivery, same-session controlled
dogfood through the built Muse CLI command graph. This establishes that the
supported local commands produce and classify factual interaction receipts
consistently. It is **not** natural or longitudinal evidence and says nothing
about usefulness, Attunement promotion, or permission.

## Reproduction

```sh
pnpm dogfood:continuity-interactions
```

The runner creates an isolated owner-only home and uses only supported commands:
`muse tasks add --local`, `muse thread start`, `muse thread link`, `muse thread
continue`, `muse tasks complete --local`, `muse thread unlink`, and `muse thread
interactions --json`. It does not inject deliveries or receipts directly.

## Fixed corpus and result

| Thread kind | exact | none | unavailable | Total |
| --- | ---: | ---: | ---: | ---: |
| life | 4 | 4 | 4 | 12 |
| work | 4 | 4 | 4 | 12 |
| **Total** | **8** | **8** | **8** | **24** |

Completion latency uses only the eight exact receipts and the canonical
`completedAt - openedAt` timestamps. The observed controlled-run summary was:

| Scope | Samples | Min | Median (nearest rank) | p95 (nearest rank) | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| life | 4 | 19 ms | 19 ms | 19 ms | 19 ms |
| work | 4 | 18 ms | 19 ms | 19 ms | 19 ms |
| **overall** | **8** | **18 ms** | **19 ms** | **19 ms** | **19 ms** |

These millisecond values measure the controlled CLI sequence, not a person's
real resumption time. Their purpose is to prove timestamp provenance and
deterministic aggregation.

## Machine-checked invariants

- explicit outcomes created: `0`
- interaction receipts: `8`
- report read changed Attunement bytes: `false`
- exact replay changed receipt count: `false`
- Attunement/task files owner-only (`0600`): `true`
- persisted permission/grant fields: `0`
- natural longitudinal evidence: `false`
- runner wall time after CLI-process startup was removed: `1,870 ms`

The runner's artifact validator fails if any matrix cell, receipt count,
latency sample count, outcome boundary, permission boundary, replay invariant,
or read-only invariant differs.

## Interpretation and next evidence

This closes the implementation-level shadow gate: the report can now expose
coverage and factual delivery-to-completion time without converting interaction
into `used`. It does not close the product evidence gap. The next evidence must
come from distinct natural life/work return moments across dates, retain
explicit `used | adjusted | ignored | rejected` feedback separately, and keep
proactive delivery and autonomy promotion disabled.
