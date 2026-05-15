# 155 — `muse session lock --hours / --minutes` strict numeric parse

## Why

Goals 143 + 144 fixed the same forgiving-prefix-parse class on
`muse feeds today --hours` and `muse maintenance compact
--keep-days` / proactive `--default-lead-minutes`:
`Number.parseFloat("4h")` returns `4`. The user typed `4h`
because they were unsure whether the unit was implied —
silently filtering to "4 of *some* unit" is exactly the bug
goal 143 was about.

`muse session lock --hours / --minutes` still used the
forgiving parser. A user typing `muse session lock --hours 4h`
got a 4-hour lock thinking they had explicitly noted hours;
`muse session lock --minutes 30m` got 30 minutes with the same
ambiguity. Neither produced any error.

## Scope

- `apps/cli/src/commands-session.ts`:
  - New private helper `parseStrictNumeric(flag, raw)` — `Number()`
    of the trimmed input, `undefined`/empty/whitespace → 0,
    non-finite → throws `<flag> must be numeric (got '<raw>')`.
  - `resolveLockUntilMs` routes both flags through it.
- `apps/cli/test/program.test.ts`:
  - Extends the goal-052 `resolveLockUntilMs` test with three
    new cases: `"4h"` rejects, `"30m"` rejects, whitespace-only
    still defaults to 1h (matches the "not supplied" branch).

## Verify

- `pnpm --filter @muse/cli test` — 399 tests pass.
- `pnpm check` exit 0.
- `pnpm lint` exit 0.
- No real-LLM path touched (`smoke:live` unchanged).

## Status

done — the strict-numeric line (143 → 144 → 155) now covers
the session-lock surface too. The user types `--hours 4h` and
gets an explicit rejection instead of a silent 4-hour DND.
