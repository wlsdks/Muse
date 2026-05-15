# 147 — `muse status` surfaces `persona.workingHours`

## Why

Goal 146 surfaced `current_focus` in `muse status`. The
companion memory entry `working_hours` (preferences only, see
`active-context.ts:165`) feeds the `working_hours=…
(in_window=yes/no)` line every model turn reads, but the user's
own dashboard didn't echo it. JARVIS-class consistency: the same
signal the agent uses should be visible in the user-facing
status line.

## Scope

- `apps/cli/src/commands-status.ts`:
  - `collectStatus` extracts
    `persona.preferences.working_hours`. Preferences-only
    precedence mirrors `DefaultActiveContextProvider` (no facts
    fallback; `working_hours` is a user-set preference, not a
    learned fact).
  - Empty / whitespace-only values drop, same as goal 146.
  - JSON snap gains optional `persona.workingHours: string`
    (raw `"<start>-<end>"`).
  - Text renderer adds `    working hours: <value>` under the
    `current focus:` line.

## Verify

- New `apps/cli/test/program.test.ts` case pins:
  - `preferences.working_hours = "9-18"` → JSON carries
    `workingHours: "9-18"`; text line `working hours: 9-18`.
  - Missing → omitted (no `"(none)"` filler).
  - Whitespace-only value treated as missing.
- `pnpm --filter @muse/cli test` — 363 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — `muse status` now mirrors the same `working_hours` signal
the agent already sees through `[Active Context]`.
