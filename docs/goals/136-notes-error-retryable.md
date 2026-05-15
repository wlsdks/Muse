# 136 — `NotesProviderError` exposes `retryable` (429 + 5xx)

## Why

Three provider error types now expose `retryable`:
`ModelProviderError` (goal 106), `MessagingProviderError`
(goal 134), `CalendarProviderError` (goal 135). The notes
provider family was the last outlier — Notion's REST API can
respond with 429 (rate limit) and 5xx, and a consumer wanting
to retry-with-backoff had to parse the `code: "NOTION_RATE_LIMIT"`
string instead of branching on a uniform `retryable` boolean.

## Scope

- `packages/mcp/src/notes-providers.ts`:
  - New `isRetryableNotesStatus(status?)` helper mirrors goals
    106 / 134 / 135 (429 OR 500-599 → true; everything else
    → false).
  - `NotesProviderError` gains optional `status?: number` 4th
    constructor arg + a derived `retryable: boolean`. Legacy
    3-arg call sites (local / Apple notes — file-IO, never HTTP)
    land on `retryable: false`.
- `packages/mcp/src/notes-providers-notion.ts`: the lone
  HTTP-bearing throw forwards `response.status` to the new arg.
- `@muse/mcp` index re-exports `isRetryableNotesStatus`.

## Verify

- New `packages/mcp/test/mcp.test.ts` case:
  - 401 → `retryable: false` (existing NOTION_AUTH test extended).
  - 429 / 503 → `retryable: true`.
  - 404 stays fail-fast.
  - Legacy 3-arg constructor (`NotesProviderError(id, code, msg)`)
    → `retryable: false`, `status` undefined.
- `pnpm --filter @muse/mcp test` — 320 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — every Muse provider error type (model / messaging /
calendar / notes) now exposes the same `retryable` contract.
Resilience layer consumers write one rule across four error
families.
