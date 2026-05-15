# 214 — 408 Request Timeout is retryable, not fail-fast

## Why

`isRetryableHttpStatus` (the single classifier every model
adapter funnels HTTP failures through; goal 106) treated
**only** 429 and 5xx as retryable and everything else in 4xx
as fail-fast. That correctly fails fast on permanent errors
(400/401/403/404/422 — bad key, bad model, malformed payload)
but mis-classified **408 Request Timeout**.

408 means the server gave up waiting for the request, so it
was **not processed** — semantically identical to 429/5xx for
retry purposes: transient, and a retry can succeed. Every
mainstream HTTP retry policy (got, axios-retry, urllib3,
cloud SDKs) includes 408 alongside 429 and 5xx. The common
source for a Qwen-only local setup is a reverse proxy /
gateway in front of the Ollama / OpenAI-compatible backend
(nginx, a tunnel, LiteLLM) returning 408 under load — Muse
was aborting the agent turn permanently on a transient
timeout instead of a quick backed-off retry, defeating the
resilience layer for exactly the kind of blip it exists to
absorb.

## Scope

- `packages/model/src/provider-base.ts`: `isRetryableHttpStatus`
  now returns `true` for `status === 408` (alongside the
  existing `429` and `500–599`). One condition; the
  fail-fast-on-the-rest-of-4xx contract is unchanged (408 was
  never in the documented permanent-error list). Doc comment
  updated to state the 408 rationale.
- `packages/model/src/provider-base.test.ts`: a focused
  assertion that `isRetryableHttpStatus(408) === true`. The
  existing "rest of 4xx is fail-fast" test already enumerated
  `[400,401,403,404,405,409,415,418,422,428]` (no 408) so it
  needs no change and still passes — no regression.

## Verify

- `pnpm --filter @muse/model test` — 141 pass / 5 skipped
  (no-key live); existing 4xx fail-fast + 5xx + 429 + bounds +
  non-finite cases unchanged → no regression.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Pure deterministic classifier — no model invoked; the unit
  tests are the authoritative verification (same stance as
  goals 194/210/211). No smoke:live needed.

## Status

done — a transient 408 from a proxy/gateway in front of a
local Qwen backend is now retried with backoff instead of
permanently aborting the agent turn; permanent 4xx errors
still fail fast exactly as before.
