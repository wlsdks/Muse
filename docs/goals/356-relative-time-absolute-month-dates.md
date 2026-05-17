# 356 — the relative-time grammar couldn't parse an absolute month-name date

## Why

Continuation of the relative-time deepening (329 bare-hour →
345 bare-time). An empirical probe showed **every** absolute
month-name date returned `undefined`: `May 20`, `Dec 25`,
`December 25 at 3pm`, `June 1 9am`, `May 20 2027`, `20 May`,
`25 dec`. "Remind me on May 20" / "task due Dec 25" is one of
the most common scheduling phrasings a person uses, and the
grammar (which backs reminders / tasks / followups / calendar
via `parseTaskDueAt`) only understood ISO + relative phrases —
so all of these failed and the whole phrase aborted.

## Scope

`packages/mcp/src/loopback-relative-time.ts`:

- New `MONTHS` map (3-letter + full names, incl. `sept`) and
  `resolveAbsoluteMonthDate(phrase, reference)` — anchored
  month-first (`May 20`) and day-first (`20 May`) regexes with
  optional `,?\s+YYYY` year and optional `(?:at )?<time>`. The
  time portion **reuses `parseTimeOfDay`** (the bare-time /
  day-part / bare-hour engine from 332/344/345), so `at 3pm`,
  `9am`, `14:30`, bare hour, noon/midnight all work after a
  date for free; no time → `09:00` (same default as a bare day
  word like "tomorrow").
- A pre-check in `resolveRelativeTimePhrase` after the
  bare-time check and before `dayPattern` (the established
  pre-check slot). `finiteDate`-wrapped like every other
  resolver.

Semantics, deliberately chosen for correctness:
- **Impossible dates rejected**: `built` is re-validated
  (`getFullYear/Month/Date` round-trip) so `Feb 30` / `Apr 31`
  → `undefined`, never a silently-overflowed `Mar 2`.
- **Next-occurrence**: no explicit year + the date already
  passed this year → next year (e.g. `May 15` on May 18 →
  2027). This matches the grammar's existing weekday
  "next" convention (weekdays always roll forward), and is the
  expected behaviour for "remind me Dec 25" stated in January.
- A malformed trailing time (`May 20 garbage`) fails the whole
  phrase rather than silently defaulting to 09:00.

Fully disjoint from the other paths — anchored, month-gated
regexes; `monday` / `tomorrow` / `in 3 days` are not month
phrases and still route through their existing handlers
(verified: unchanged).

## Verify

- Empirically dog-fooded on the rebuilt dist before writing
  the test: all the forms above resolve correctly,
  next-occurrence rolls `May 15`→2027, `Feb 30`/`Apr 31`/
  `May 20 garbage`→`undefined`, and `monday`/`tomorrow`/
  `in 3 days` are byte-unchanged.
- `pnpm --filter @muse/mcp test` — 361 pass (was 360; +1). New
  test pins month-first / day-first / trailing-time / explicit
  year / next-occurrence / impossible-date-rejection and the
  weekday/today no-regression cases.
- `pnpm check` — every workspace green (mcp 361, apps/cli 611,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched — deterministic
  input-phrase parsing; the resolved `Date` feeds the
  reminder/task stores. The deterministic regression (plus the
  pre-write dist dog-food) is the rigorous verification.

## Status

done — the relative-time grammar now resolves absolute
month-name dates ("May 20", "Dec 25 at 3pm", "20 May 2027")
with next-occurrence year inference and impossible-date
rejection, closing the single biggest remaining scheduling
phrasing gap; all prior relative/weekday/time forms are
unchanged.
