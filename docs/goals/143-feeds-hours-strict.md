# 143 — `muse feeds today --hours` validates numeric input strictly

## Why

`muse feeds today --hours abc` silently fell back to the default
24 hours because the pre-iter parser threw away the result of
`Number.parseFloat` when it produced NaN. Worse:
`Number.parseFloat("4h")` returns `4` (forgiving prefix parse), so
a user typing `--hours 4h` (the unit slip is common) got `4h`
applied instead of the rejection they should have seen.

Same silent-typo footgun class as goals 125 / 137 (`--status`).
The fix is two-fold: reject non-numeric input outright AND use a
strict `Number()` parse so prefix-only matches like `"4h"` /
`"12hrs"` don't silently coerce.

## Scope

- `apps/cli/src/commands-feeds.ts` `feeds today` action:
  - When `--hours` is provided, trim, reject empty, then parse
    with `Number(trimmed)` (strict — `"4h"` → NaN).
  - Three error branches with explicit messages:
    - empty after trim → `"--hours must not be empty"`
    - non-finite → `"--hours must be a positive number (got 'X')"`
    - `≤ 0` → `"--hours must be > 0 (got N)"`
  - Default (`--hours` omitted) stays at 24.

## Verify

- New `apps/cli/test/program.test.ts` case pins every branch:
  - `--hours abc` → non-numeric rejection.
  - `--hours 4h` → unit-slip rejected with the same message
    (strict `Number()` catches it).
  - `--hours 0` / `--hours -3` → > 0 rejection.
  - `--hours "   "` → empty rejection.
  - `--hours 12` and the no-flag default both resolve cleanly.
- `pnpm --filter @muse/cli test` — 359 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — `muse feeds today --hours` no longer silently swallows
unit-slip typos; the user sees the filter wasn't applied instead
of getting a misleading "successful" result.
