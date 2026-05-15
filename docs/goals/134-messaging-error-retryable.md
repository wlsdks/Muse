# 134 — `MessagingProviderError` exposes `retryable` (429 + 5xx)

## Why

Goal 106 widened `ModelProviderError.retryable` to cover 429
(rate limit) for the LLM-provider adapter family. The messaging
adapter family (Telegram / Discord / Slack / LINE) had the same
gap on the chat-out side:

- Telegram, Discord, Slack, and LINE all respond with 429 +
  `Retry-After` when over budget; passing the error up as
  `code: UPSTREAM_FAILED` without a retry flag forced consumers
  (the proactive-notice loop, `muse messaging send`,
  `/api/messaging/send`) to inspect `err.status` directly. Leaky
  abstraction, inconsistent with the LLM contract.
- A resilience layer that wanted "retry on 429/5xx, fail fast on
  4xx" couldn't write `if (err.retryable)` — it had to special-
  case each error type.

## Scope

- `packages/messaging/src/errors.ts`:
  - New `isRetryableMessagingStatus(status?)` helper. Mirrors
    `isRetryableHttpStatus` from `@muse/model`: 429 OR 500-599
    → true; everything else → false; NaN / undefined / out-of-
    spec ≥ 600 → false.
  - `MessagingProviderError` constructor derives + stores a
    `retryable: boolean` field from the optional status. Non-HTTP
    codes (`PROVIDER_NOT_FOUND`, `INVALID_DESTINATION`,
    `INVALID_TEXT`) always land on `false`.
  - Helper re-exported from `@muse/messaging` index.
- No changes to call sites — every existing constructor already
  passes the response status when known; the derivation happens
  inside the constructor.

## Verify

- New `packages/messaging/test/messaging.test.ts` cases:
  - `isRetryableMessagingStatus` returns true for 429 / 5xx,
    false for 4xx (other) / 2xx / 3xx / 600+ / NaN / undefined.
  - `MessagingProviderError` with status 429 / 502 → retryable.
    With 401 / no status → not retryable.
  - End-to-end through Telegram's send path: 429 + 5xx errors
    arrive with `retryable: true`, 404 with `retryable: false`,
    and the existing 401 case picks up `retryable: false`.
- `pnpm --filter @muse/messaging test` — 109 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — resilience-layer consumers can now write
`if (err.retryable) backoff()` for both LLM and messaging
provider errors. Same contract end-to-end.
