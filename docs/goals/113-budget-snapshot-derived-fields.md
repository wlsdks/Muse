# 113 — `MonthlyBudgetSnapshot` exposes `remainingUsd` + `percentUsed`

## Why

`MuseObservabilitySnapshotProvider.snapshot().budget` returns
`{ month, totalCostUsd, limitUsd, status }`. Every dashboard
consumer (`/api/admin/muse/snapshot`, `muse metrics show`,
`muse status` token-cost surfacing) recomputed the two derived
numbers a user actually reads — "how much budget is left?" and
"what percent did I burn?" — and at least one consumer (in
unbounded-budget config) was at risk of dividing by zero on
`limitUsd = 0`. Centralising the math in `snapshot()` keeps every
surface consistent + eliminates the divide-by-zero footgun.

## Scope

- `packages/observability/src/observability-detectors.ts`
  `MonthlyBudgetTracker.snapshot()`:
  - Add `remainingUsd` = `max(0, limit - total)`.
  - Add `percentUsed` = `clamp(0, 100, (total / limit) * 100)`.
  - Both fields are **omitted** when `limitUsd <= 0`
    (unlimited-budget config) — a dashboard rendering "remaining:
    $-12" or "112% used" is worse than rendering nothing.
- `MonthlyBudgetSnapshot` interface gains the two optional fields.
  Additive — no consumer is forced to change; existing reads of
  `status` / `totalCostUsd` / `limitUsd` keep working.

## Verify

- New `packages/observability/test/observability.test.ts` cases:
  - Limit `$10`, no spend → `remainingUsd 10`, `percentUsed 0`.
  - After `$5` → `remaining 5`, `percent 50`.
  - After `$12` → `remaining 0`, `percent 100` (clamped); raw
    `totalCostUsd` still `12` so audit-trail consumers see the
    overrun.
  - Unlimited (no `monthlyLimitUsd`) → both derived fields
    `undefined`.
- `pnpm --filter @muse/observability test` — 54 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — every dashboard that reads the budget snapshot now gets
the two derived fields without recomputing, and the
unlimited-budget case is divide-by-zero safe.
