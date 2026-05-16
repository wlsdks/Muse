# 253 — "in 1 month" from Jan 31 silently became Mar 3

## Why

`resolveRelativeTimePhrase` is the natural-language time core
behind `muse remind <when>`, `muse tasks add --due`,
`muse followup`, and the `muse.reminders.add` / `muse.tasks.add`
MCP tools the agent calls. A misparse here is the worst class of
bug for a JARVIS: a reminder silently set to the wrong time =
a missed reminder, with no error surfaced.

Both month-offset branches used raw `Date.setMonth`:

```ts
// English  "in N months"
const next = new Date(reference);
next.setMonth(next.getMonth() + amount);

// Korean   "N개월 후" / "N달 후"  (the user's native language)
const next = new Date(reference);
next.setMonth(next.getMonth() + amount);
```

`Date.setMonth` overflows on month-end dates: `Jan 31 + 1mo`
sets month to February on a day-31 date — February has 28 days —
so JS rolls it forward to **Mar 3**. "Remind me in 1 month" on
Jan 31 fired in March, skipping February entirely. The same hole
existed for `Mar 31 + 1mo` (→ May 1 instead of Apr 30) and on the
Korean path. The existing `goal 110` test even documented the
footgun in a comment ("Anchor on a safe mid-month date so the
test doesn't trip the JS month-rollover edge case (Jan 31 + 1 ->
Mar 3)") and deliberately avoided it rather than fixing it.

## Scope

`packages/mcp/src/loopback-relative-time.ts`:

- New module-private `addCalendarMonths(reference, amount)`:
  `setMonth`, then if the resulting month overshot the intended
  one (the overflow signature), `setDate(0)` to clamp back to the
  last day of the intended month. Jan 31 + 1mo → Feb 28, Mar 31 +
  1mo → Apr 30, Jan 15 + 1mo → Feb 15 (unchanged), Dec 31 + 2mo →
  Feb 28 next year.
- Both call sites (English `unit === "month"` and Korean
  `개월 / 달`) now delegate to it — one helper, two sites, same
  bug class. The English path keeps its `finiteDate(...)` wrap and
  the Korean result is still wrapped by the existing
  `finiteDate(resolveKoreanRelativePhrase(...))`, so a pathological
  huge `amount` still resolves to `undefined` (no behaviour change
  there).

The stale "safe mid-month" comment in the goal-110 test is
removed since the edge case is now handled.

## Verify

- `pnpm --filter @muse/mcp test` — 341 pass (was 340; +1). New
  test pins Jan 31 + 1mo → Feb 28 on **both** the English
  (`in 1 month`) and Korean (`1개월 후`) paths, Mar 31 + 1mo →
  Apr 30, the non-overflow Jan 15 + 1mo → Feb 15 (untouched), and
  the end-to-end `parseTaskDueAt("in 1 month", jan31)` → a valid
  `2026-02-28…` ISO (no `RangeError`). The existing goal-110
  calendar-month test and the out-of-range (`in 999999999 months`
  → `undefined`) test stay green — semantics preserved for the
  common and pathological cases.
- `pnpm check` — every workspace green (mcp 341, apps/cli 555,
  apps/api 155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (pure deterministic
  calendar-date math). The bug is a calendar edge case a live
  Qwen run would not deterministically hit on the current date, so
  the unit test with an injected `now()` anchored on Jan 31 is the
  rigorous verification — the same stance used for the other pure
  deterministic-logic fixes.

## Status

done — relative-time month offsets now use clamped calendar
semantics on both the English and Korean paths, so "in 1 month" /
"1개월 후" from a month-end date lands on the intended month's
last day instead of silently skipping a month and firing a
reminder weeks late.
