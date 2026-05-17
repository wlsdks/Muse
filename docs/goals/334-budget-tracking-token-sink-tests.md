# 334 — `createBudgetTrackingTokenUsageSink` had zero test coverage

## Why

Continuing the testing.md "direct unit tests for every export —
no implicit-only coverage" lane (goal 333). A precise
export-vs-test-reference scan of `@muse/observability` found
several zero-reference exports; the highest-leverage
behaviour-bearing one is `createBudgetTrackingTokenUsageSink` —
**not referenced in any test file**.

It is the integration point between token-usage recording and
the monthly budget tracker:

```ts
return wrapTokenUsageSink(inner, async (event) => {
  tracker.recordCost(event.estimatedCostUsd ?? 0);
});
```

This sits on a "deterministic code for budgets" non-negotiable
and the project's ZERO-cost posture: every model call's cost
flows through here into `MonthlyBudgetTracker`. Three distinct
load-bearing behaviours were entirely unverified — inner-sink
delegation, the `?? 0` guard (a missing/absent
`estimatedCostUsd` must not poison the running total), and the
`QueryableTokenUsageSink` `list()` passthrough (consumers wrap a
queryable sink and still expect to query it). A regression in
any of these silently corrupts spend reporting or drops usage
rows, with nothing to catch it.

## Scope

Test-only. `packages/observability/test/observability.test.ts`
— new `describe("createBudgetTrackingTokenUsageSink")` (import
added), four `it`s over a real `InMemoryTokenUsageSink` +
`MonthlyBudgetTracker`:

- **Delegation + accumulation**: two events (cost 2, 3) → inner
  sink received both *and* `tracker.snapshot().totalCostUsd === 5`.
- **`?? 0` guard**: an event with `estimatedCostUsd: undefined`
  → tracker total stays `0`, event still delegated (a costless
  event can't poison the budget).
- **Queryable passthrough**: the wrapped sink still exposes a
  working `list()` returning the inner events (the
  `QueryableTokenUsageSink` branch of `wrapTokenUsageSink`).
- **End-to-end status drive**: recording costs through the
  wrapper moves `MonthlyBudgetTracker` `ok → warning →
  exceeded`, proving the wrapper actually feeds the tracker.

`snapshot().status`/`.totalCostUsd` were verified against
`MonthlyBudgetSnapshot` (observability-detectors.ts) before
asserting — no guessed shapes. No production code changed.

## Verify

- `pnpm --filter @muse/observability test` — 60 pass (was 56;
  +4). The new block is green; existing latency / tracer /
  budget / token-cost suites untouched and green.
- `pnpm check` — every workspace green (observability 60,
  apps/cli 563, apps/api 161, all packages). `pnpm lint` —
  exit 0. The goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched (deterministic
  sink/tracker wiring). The deterministic suite is itself the
  verification.

## Status

done — the budget-feeding token-usage sink wrapper now has
direct coverage of delegation, the costless-event `?? 0` guard,
the queryable passthrough, and the end-to-end budget-status
drive, closing an implicit-only-coverage gap on a cost-control
integration point. No behaviour changed; future regressions now
fail `pnpm check`.
