# 333 — `isCancellationLikeError` had zero direct test coverage

## Why

This iteration I surveyed broadly and **verified-and-rejected**
several candidates rather than forcing a change: the guard
pipeline correctly fails closed on a thrown stage
(`guard-pipeline.ts:52`), `computeRetryDelay` is exhaustively
non-finite-guarded, the `retry → isRetryableProviderError →
ModelProviderError.retryable` chain honours architecture.md
end-to-end, and the English greeting-strip filter's
comma-exclusion is an **intentional, explicitly-tested**
anti-false-positive contract (`english-locale-filters.test.ts:95`
asserts `"Sure, the answer is Paris."` is preserved). Probing
mature code for behaviour bugs was yielding non-bugs.

The clean, unambiguous, safe high-leverage gap is the one
testing.md names directly: **"Direct unit tests for every
export of every helper module — no implicit-only coverage."**
`isCancellationLikeError` (`@muse/resilience`) had **none** —
not referenced in any test file. It is correctness-critical:
it is the predicate `retry()` uses to *immediately re-throw* an
abort/cancellation instead of retrying it. A regression there
would mean a user-cancelled or timed-out operation gets retried
`maxAttempts` times and the real `AbortError`/`TimeoutError`
gets buried inside `RetryExhaustedError` — wasted work, ignored
cancellation, masked root cause. A load-bearing predicate with
zero direct tests is a latent regression waiting to happen.

## Scope

Test-only. `packages/resilience/test/resilience.test.ts` — new
`describe("isCancellationLikeError")` (import added):

- **Recognised signatures**: `{ name: "AbortError" }`,
  `{ code: "ABORT_ERR" }`, an `Error` with `name="AbortError"`,
  and a real `DOMException(..., "AbortError")` (the actual
  `AbortController.abort()` rejection shape).
- **Negatives / every guard branch**: a plain `Error`, an
  object with neither field, `null`, `undefined`, a string, a
  number, `{}` — exercising the `!error` and
  `typeof !== "object"` short-circuits.
- **The load-bearing integration guarantee**: `retry()` given
  an operation that throws an `AbortError` rejects with the
  **exact same error** (`rejects.toBe(abortErr)`), the operation
  runs **exactly once** (not retried), and it is **not** wrapped
  in `RetryExhaustedError`. This pins the
  cancellation-short-circuits-retry contract that the predicate
  exists to provide.

No production code changed — this locks existing behaviour.

## Verify

- `pnpm --filter @muse/resilience test` — 20 pass (was 17;
  +3). The new block is green; the existing circuit-breaker /
  retry / timeout / fallback suites are untouched and stay
  green.
- `pnpm check` — every workspace green (resilience 20,
  apps/cli 563, apps/api 161, all packages). `pnpm lint` —
  exit 0. The goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched (deterministic
  predicate + retry-control-flow test). The deterministic
  suite is itself the verification.

## Status

done — the correctness-critical `isCancellationLikeError`
predicate now has direct unit coverage of every branch plus the
retry short-circuit guarantee it underpins, closing an
implicit-only-coverage gap on load-bearing cancellation
handling. No behaviour changed; future regressions now fail
`pnpm check`.
