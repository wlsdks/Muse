# 174 — `retry()` fails fast on a non-retryable error

## Why

Found by dog-food: `muse chat --model ollama/nonexistent-model`
surfaced
`Retry attempts exhausted after 3 attempt(s) — Ollama /api/chat
failed with 404: model 'nonexistent-model-xyz' not found`.

Root cause in `packages/resilience/src/index.ts` `retry()`:
when an error was correctly classified **non-retryable**
(`options.retryable(...) === false`), the loop `break`-ed
after attempt 1 — but the function then *unconditionally*
threw `new RetryExhaustedError(maxAttempts, lastError)`. So a
fail-fast permanent error (404 model-not-found, 401 bad key —
the cases `architecture.md` says MUST fail fast):

- **lied about the count** ("3 attempt(s)" when only 1 ran),
- **buried the clean root cause** under a RetryExhaustedError
  wrapper that implies the system tried hard and gave up,
- and on the *other* paths still paid 3× latency + backoff
  sleeps before reporting (the classification was right; only
  the post-loop throw was wrong).

This affected **every** non-retryable provider error across
the whole system (bad model, bad key, 4xx), via
`isRetryableProviderError` → `retry`.

## Scope

- `packages/resilience/src/index.ts` `retry()`:
  - On `options.retryable(error) === false`: `throw error`
    immediately (fail fast, original clean message).
  - `RetryExhaustedError` is now thrown only on genuine
    exhaustion (`attempt >= maxAttempts` while still
    retryable). Its `attempts` count is therefore accurate.
  - Metrics `recordRetryAttempt(..., false)` recorded once per
    failed attempt regardless of branch (unchanged semantics).
- Existing tests unaffected (they pass no `retryable`
  predicate). 2 new tests: non-retryable → original error,
  1 attempt, NOT RetryExhaustedError; retryable → still
  exhausts + wraps with the correct count.

## Verify

- `pnpm --filter @muse/resilience test` — 13 pass (2 new).
- `pnpm check` exit 0 monorepo-wide (resilience is a core dep:
  scheduler/autoconfigure/api/cli all green — no regression).
- `pnpm lint` exit 0.
- Dog-food (Ollama qwen3:8b API): `muse chat --model
  ollama/nonexistent-model` now →
  `Ollama /api/chat failed with 404: model … not found`
  (clean root cause, no "Retry attempts exhausted" wrapper,
  1 attempt not 3).

## Status

done — non-retryable errors now fail fast with their real
message and a truthful attempt count, system-wide. Honours
the architecture.md retry-classification contract end-to-end
(it was classified right; the reporting is now right too).
Real-LLM error path; verified via a live qwen3:8b round-trip.
