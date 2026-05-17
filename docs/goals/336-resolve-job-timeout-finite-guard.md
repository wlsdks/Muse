# 336 — resolveJobTimeout let a non-finite executionTimeoutMs poison the lock TTL / watchdog

## Why

Probed the deterministic agent tools this iteration and
verified-and-rejected several (math_eval siblings, next_weekday,
cron_for_datetime all correct). The concrete in-class bug was in
the scheduler. `resolveJobTimeout` (a zero-test-reference export
on a "deterministic stop-condition" non-negotiable path):

```ts
const value = job.executionTimeoutMs ?? fallbackMs;
return value <= 0 ? fallbackMs : value;
```

`??` only catches `null`/`undefined` — **not `NaN`/`Infinity`**
— and `NaN <= 0` is `false`, so a corrupt/hand-edited/older-schema
persisted job whose `executionTimeoutMs` is `NaN` makes
`resolveJobTimeout` **return `NaN`**. That flows into two
reliability paths:

- `dynamic-scheduler.ts:187`: `Math.max(minLockTtlMs,
  resolveJobTimeout(job, …) + buffer)` → `Math.max(x, NaN)` =
  **NaN** lock TTL → the distributed lock TTL is corrupt.
- `index.ts:307`: the execution watchdog `timeoutMs` → `NaN` →
  `setTimeout(NaN)` coerces to `0` → **the job times out
  immediately**.

`validateExecutionTimeout` guards the *create* path
(`index.ts:238`) but `resolveJobTimeout` runs at *execution*
time on already-persisted jobs — the same "load path doesn't
re-validate what create validated" shape as goals 316/317/318,
and the same "`??` doesn't catch NaN" class as goals
280/284/289/308/310 and `computeRetryDelay`'s documented
posture. It had **zero** direct test coverage.

## Scope

`packages/scheduler/src/scheduler-helpers.ts` —
`resolveJobTimeout`:

- Return `Number.isFinite(value) && value > 0 ? value :
  fallbackMs`. This both preserves the prior `<= 0 → fallback`
  behaviour (`value > 0`) and adds the finite guard
  (`Number.isFinite`), so `NaN` / `±Infinity` now fall back to
  the caller's sane default. One short WHY comment records the
  lock-TTL/watchdog poisoning rationale (non-derivable).

`fallbackMs` is internal config (`defaultExecutionTimeoutMs`),
not the untrusted input — guarding the job-supplied field is
the tight, correct scope, mirroring the personal-store
load-guard goals.

## Verify

- `pnpm --filter @muse/scheduler test` — 53 pass (was 50; +3).
  New `describe("resolveJobTimeout")`: valid positive →
  passthrough; `undefined` / `0` / `-1` → fallback;
  `NaN` / `+Infinity` / `-Infinity` → fallback (the new guard).
  Closes the zero-coverage gap on this export.
- `pnpm check` — every workspace green (scheduler 53,
  apps/cli 563, apps/api 161, all packages). `pnpm lint` —
  exit 0. The goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched — deterministic
  timeout resolution. The deterministic suite is the rigorous
  verification (a live run can't manufacture a corrupt
  persisted timeout on demand) — same stance as the non-finite
  sweep siblings.

## Status

done — `resolveJobTimeout` now rejects a non-finite or
non-positive `executionTimeoutMs` and falls back to the default,
so a corrupt persisted job can no longer NaN-poison the
distributed lock TTL or the execution watchdog; the previously
untested helper is now covered including the finite-guard edge.
