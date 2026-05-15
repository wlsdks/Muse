# 137 — `muse remind list --status <typo>` rejects + suggests right value

## Why

Goal 125 closed the silent-typo footgun on `muse tasks list
--status`. `muse remind list --status` had the same gap:
`readReminderStatusFilter` in `@muse/mcp` deliberately falls back
to `"pending"` for unknown values (LLM tool path needs that
leniency), but the CLI surface inherited it without a guard. A
user typing `muse remind list --status fire` (typo for `fired`)
silently got the pending list back.

## Scope

- `apps/cli/src/commands-remind.ts`:
  - New CLI-local `assertReminderStatusInput(raw)` against
    `{pending, fired, all, due}` with the goal-099 closest-match
    hint on miss.
  - The `remind list` action runs the helper before either local
    or remote branch dispatches.
- Shared `readReminderStatusFilter` keeps its lenient
  MCP-friendly semantics — only the CLI surface tightens.

## Verify

- New `apps/cli/test/program.test.ts` case pins:
  - `--status fire` → `did you mean 'fired'?`.
  - `--status dues` (plural slip) → `did you mean 'due'?`.
  - `--status totally-unrelated` → "must be one of: pending,
    fired, all, due" with no false-positive suggestion.
  - Happy path (`--status pending`) still reaches the fetch path.
- `pnpm --filter @muse/cli test` — 355 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — typo-suggestion line now covers `muse remind list
--status` too.
