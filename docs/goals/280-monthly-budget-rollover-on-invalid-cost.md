# 280 — MonthlyBudgetTracker returned last month's "exceeded" when the new month's first cost was invalid

## Why

`MonthlyBudgetTracker` (`@muse/observability`) is the monthly
spend aggregator wired by `createBudgetTrackingTokenUsageSink`
into every recorded usage event; its status (`ok` / `warning` /
`exceeded`) surfaces on `/api/admin/muse/snapshot.budget` and is
the natural gate for "stop spending this month". Month rollover
is handled lazily by `#resetIfNewMonth()` (zeroes the running
total when the `YYYY-MM` changes), called on every access path —
`currentCost()`, `snapshot()`, and the normal `recordCost()`
path.

But `recordCost` checked input validity **before** rolling over:

```ts
recordCost(costUsd: number): MonthlyBudgetStatus {
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    return this.statusFor(this.#total);   // <-- stale prior-month total
  }
  this.#resetIfNewMonth();
  this.#total += costUsd;
  return this.statusFor(this.#total);
}
```

The invalid-input early-return is the **only** path that skips
`#resetIfNewMonth()`. A non-finite cost reaching it is reachable:
`createBudgetTrackingTokenUsageSink` passes
`event.estimatedCostUsd ?? 0`, and `?? 0` does **not** coerce
`NaN` — a provider that reports a malformed `estimatedCostUsd`
(or `Infinity`, or a negative) flows straight into
`recordCost(NaN)`. If that is the **first** event of a new month
and the previous month had ended `exceeded`, the tracker returns
`"exceeded"` for a brand-new $0 month until some later valid cost
event finally triggers the reset. A caller gating on the status
would wrongly refuse to proceed on day 1 of the new month — a
silent-wrong with a concrete bad consequence (false budget block
at rollover), the same fail-on-bad-input class as goals 261 /
274.

## Scope

`packages/observability/src/observability-detectors.ts` —
`MonthlyBudgetTracker.recordCost`:

- Hoist `this.#resetIfNewMonth()` to the top, **before** the
  validity check, so the invalid-input early-return reports the
  status of the *current* month (post-reset), consistent with
  `currentCost()` / `snapshot()`. One short WHY comment records
  the NaN-not-coerced-by-`?? 0` rationale.

Behaviour-preserving for valid input: the normal path was already
`resetIfNewMonth → total += cost → statusFor`; moving the reset
one statement earlier (still before the add) is identical. The
only change is that a non-finite / negative cost now also rolls
the month over before returning.

## Verify

- `pnpm --filter @muse/observability test` — 56 pass. New
  regression: previous month exceeds the limit, clock advances to
  the 1st of the next month, the first event is `recordCost(NaN)`
  → must return `"ok"` with snapshot `month: "2026-06"`,
  `totalCostUsd: 0` (pre-fix: `"exceeded"`). The existing
  no-limit, ok→warning→exceeded, valid-cost rollover, and
  invalid-config tests stay green.
- `pnpm check` — every workspace green (observability 56,
  apps/cli 561, apps/api 160, all packages). `pnpm lint` —
  exit 0.
- No real-LLM request/response path touched (pure deterministic
  budget accounting). A live Qwen run cannot reproduce a
  NaN-cost-at-rollover on demand, so the deterministic regression
  is the rigorous verification — same stance as goals 261 / 274 /
  275 / 276 / 277 / 278.

## Status

done — `MonthlyBudgetTracker` now rolls the month over even when
the first cost of a new month is invalid, so a malformed provider
cost can no longer pin the budget status to the previous month's
"exceeded" and falsely block a budget-gated caller at rollover.
Valid-cost behaviour is unchanged.
