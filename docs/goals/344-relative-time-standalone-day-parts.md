# 344 — "tonight" / "this evening" failed the relative-time grammar

## Why

Empirically probed `resolveRelativeTimePhrase` with common
phrasings; the highest-frequency miss was the **standalone
day-part**: "tonight", "this evening", "this afternoon", "this
morning" (and bare "evening"/"afternoon"/…) all returned
`undefined`, so "remind me tonight" / "ping me this afternoon"
— among the most natural ways a person schedules a same-day
task — silently failed and aborted the whole phrase.

Goal 332 added day-parts only as a *time spec after a day head*
("tomorrow evening") and explicitly deferred the standalone
form ("tonight"/"this evening", no day head) as a separate
shape. This closes that deferred follow-up. Today the dispatch
sent "tonight" into the dayPattern's bare-`[a-z]+` branch →
`WEEKDAY_INDEX["tonight"]` undefined → `return undefined`;
"this evening" → head `this` → same dead end.

## Scope

`packages/mcp/src/loopback-relative-time.ts`:

- New `standaloneDayPartHour(phrase)` helper: `"tonight"` →
  the `night` hour; `/^(?:this\s+)?(morning|afternoon|evening|
  night)$/` → that part's hour. Reuses the existing
  `DAY_PART_HOURS` map (no duplicated hour constants);
  `number | undefined` return respects `noUncheckedIndexedAccess`.
- A pre-check in `resolveRelativeTimePhrase`, placed after the
  `in N <unit>` block and **before** `dayPattern`: a matched
  standalone day-part resolves to **today** at that hour
  (`startOfDay(reference)` + `setHours`), consistent with the
  existing "today <time>" semantics (returns the instant even
  if already past — the caller/firing loop owns past-due).

Tight + fully disjoint: the regex is anchored (`^…$`) so it
only matches the bare / `this `-prefixed forms; any day-headed
phrase ("tomorrow evening", "monday night") still flows through
`dayPattern` + `parseTimeOfDay` exactly as before — the two
paths never overlap. One short WHY comment records the
disjointness + tonight-synonym rationale (non-derivable).

## Verify

- `pnpm --filter @muse/mcp test` — 359 pass (was 358; +1). New
  test: `"tonight"` → today 21:00, `"this evening"` → today
  18:00, `"this afternoon"` → 15:00, `"this morning"` → 9:00,
  bare `"evening"` → 18:00, `"this evening"` stays **today**
  (date 18, not 19); `"tomorrow evening"` still → next day
  18:00 (day-headed path unaffected); `"this lunchtime"` →
  `undefined` (non-day-part still unrecognized). The existing
  bare-hour (329) / article (330) / second (331) / day-parts
  (332) / Korean / out-of-range suites stay green. (Caught a
  missing dynamic-import in the first test draft via the run —
  fixed, not worked around.)
- `pnpm check` — every workspace green (mcp 359, apps/cli 581,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched — deterministic
  input-phrase parsing; the resolved `Date` feeds the
  reminder/task stores. The deterministic regression is the
  rigorous verification.

## Status

done — the relative-time grammar now resolves standalone
day-parts ("tonight" → today 21:00), closing another very
common JARVIS phrasing gap and the goal-332 deferred follow-up;
all day-headed and prior time forms are unchanged and
non-day-part words still fail safely to `undefined`.
