# 135 — `CalendarProviderError` exposes `retryable` (429 + 5xx)

## Why

Goals 106 (`ModelProviderError.retryable`) and 134
(`MessagingProviderError.retryable`) gave the LLM-provider and
messaging-provider error contracts a uniform "is this worth
retrying?" boolean. Calendar providers were the lone outlier:

- `CalendarProviderError` only carried `code: "HTTP_429"` /
  `"HTTP_503"` / etc. — consumers had to parse the string prefix
  to extract the status and infer transience.
- Google Calendar's burst quota responds with 429 + Retry-After
  on heavy days; CalDAV servers (Radicale, Baikal, iCloud,
  Google's CalDAV bridge) surface 429 / 503 under load.
- The resilience layer couldn't write
  `if (calErr.retryable) backoff()` for the same shape it
  already uses for messaging + LLM errors.

## Scope

- `packages/calendar/src/errors.ts`:
  - New `isRetryableCalendarStatus(status?)` — 429 OR 500-599
    → true; everything else (incl. NaN / undefined / out-of-spec
    ≥ 600) → false. Mirrors the helper added in goals 106 / 134.
  - `CalendarProviderError` constructor signature gains an
    optional 5th param `status?: number`. Existing call sites
    that don't pass status land on `retryable: false` (safe
    default — local / validation errors aren't transient).
  - `retryable: boolean` derived from `status`.
  - Helper re-exported from `@muse/calendar` index.
- `caldav-provider.ts` — all 4 `HTTP_${status}` throws pass
  `response.status` as the new 5th arg.
- `google-provider.ts` — both `HTTP_${status}` and `OAUTH_${status}`
  throws pass `response.status`.

## Verify

- New `packages/calendar/test/calendar.test.ts` cases:
  - `isRetryableCalendarStatus` returns true for 429 / 5xx and
    false for 4xx (other) / 2xx / 3xx / 600+ / NaN / undefined.
  - `CalendarProviderError` constructed with status 429 / 503 →
    retryable; with 401 → not retryable; legacy 3-arg form (no
    status) → `retryable: false`.
- `pnpm --filter @muse/calendar test` — 13 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — every Muse provider error type (model / messaging /
calendar) now exposes the same `retryable` contract. Resilience
layer consumers write one rule, not three.
