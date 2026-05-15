# 144 — strict `Number()` parse for `--keep-days` + `--default-lead-minutes`

## Why

Goal 143 fixed `muse feeds today --hours` to reject unit-slip
typos (`--hours 4h` silently coercing to 4). Two more sibling
flags carried the same `Number.parseFloat` / `Number.parseInt`
forgiving-prefix-parse pattern:

- `muse maintenance compact --keep-days 7d` → silently 7 days
  instead of rejecting the suffix slip.
- `muse watch-folder --default-lead-minutes 60m` → silently 60
  minutes instead of rejecting the unit slip.

Both flags drive on-disk effects (archive rotation cutoff, task
dueAt fallback). A silent "this 'unit' didn't apply but the
filter ran anyway" pattern is exactly what JARVIS-class
ergonomics rejects.

## Scope

- `apps/cli/src/commands-maintenance.ts` `compact` action:
  - Switch `Number.parseFloat` → `Number(trimmed)` for
    `--keep-days`.
  - Error message names the offending input verbatim
    (`got '7d'`).
- `apps/cli/src/commands-watch-folder.ts` action:
  - Replace the inline `|| 60` fallback with an explicit four-
    branch parse:
    - empty after trim → reject.
    - non-finite (`Number(trimmed)` catches `"60m"`) → reject.
    - `< 1` → reject (lead-minutes must be at least 1).
    - else: `Math.trunc(parsed)`.

## Verify

- New `apps/cli/test/program.test.ts` cases pin:
  - `--keep-days 7d` → "--keep-days must be a non-negative number
    (got '7d')".
  - `--keep-days -3` → same negative-rejection branch.
  - `--default-lead-minutes 60m` → "must be >= 1 (got '60m')".
  - `--default-lead-minutes 0` → "must be >= 1".
- `pnpm --filter @muse/cli test` — 361 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — the unit-slip typo footgun goal 143 closed for `--hours`
is now also closed for `--keep-days` and `--default-lead-minutes`.
