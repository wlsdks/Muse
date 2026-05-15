# 149 — `runDueReminders` reuses `sendWithRetry`

## Why

Three messaging-dispatch loops live in `@muse/mcp`:

| Loop                          | Pre-149 retry?                    |
|-------------------------------|------------------------------------|
| `runDueProactiveNotices`      | yes — `sendWithRetry` (070 + 148)  |
| `runDueReminders`             | **no — single attempt**            |
| `runDueFollowups`             | no — single attempt                |

A user-set 9 am reminder shouldn't fail because Telegram coughed a
one-off 503 on the first attempt; the proactive surface gets the
goal-070 / goal-148 transient-resilience treatment but the
reminder-firing loop on its own dropped the same class of error.

This iteration extracts `sendWithRetry` to a shared helper
(`messaging-retry.ts`) and wires it into `runDueReminders`. The
proactive loop continues to use the same function — behaviour
preserved.

## Scope

- New `packages/mcp/src/messaging-retry.ts`:
  - Exports `sendWithRetry(registry, providerId, message)`.
  - Three attempts (0 ms / 200 ms / 800 ms backoff).
  - Non-retryable `MessagingProviderError` (401 / 404 / validation
    failures, classified via `retryable: false` from goal 134)
    short-circuits on attempt 1.
- `packages/mcp/src/proactive-notice-loop.ts`:
  - Import the shared helper instead of the local copy.
  - Local `sendWithRetry` function removed.
- `packages/mcp/src/reminder-firing-loop.ts`:
  - Wraps the per-reminder `registry.send` with `sendWithRetry`.

## Followup loop

Intentionally not touched. `runDueFollowups` is gated by a
per-tick LLM synthesis step and a `maxPerTick` cap (default 5) —
the retry surface there has a different cost profile (synthesis
already burned model budget; a 3-attempt ladder on top would
amplify the bill on a stuck provider). Left for a later goal
once we have a clearer signal that followups also drop on
transient errors in practice.

## Test changes

Three existing reminder tests used plain `Error` to simulate a
single-attempt failure. Post-149 those would retry and the
failure would be masked, so they were updated to throw a
non-retryable `MessagingProviderError` (401) — the test intent
("delivery fails → status preserved / history recorded") is
unchanged, the error class is now a faithful match for the
production code path.

Two new tests added (`runDueReminders` block in
`packages/mcp/test/mcp.test.ts`):

- *retries transient messaging failures with exponential backoff
  (goal 149)* — plain `Error` thrown twice, third succeeds, asserts
  `delivered === 1`, `errors === []`, `attempts === 3`.
- *breaks out of the retry loop early on non-retryable messaging
  errors (goal 149)* — `MessagingProviderError(status=401)` thrown,
  asserts `attempts === 1` (not 3) and the error message survives
  the summary.

## Verify

- `pnpm --filter @muse/mcp test` — 324 tests pass (up from 322).
- `pnpm check` exit 0.
- `pnpm lint` exit 0 (no new warnings).
- No real-LLM path touched (`smoke:live` unchanged).

## Status

done — reminder-firing now matches proactive-notice's
transient-resilience without duplicating the retry implementation.
