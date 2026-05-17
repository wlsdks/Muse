# 345 — "at 5pm" / "5pm" / "noon" (no day word) failed the relative-time grammar

## Why

Continuing the empirical relative-time probe (329 bare hour,
330 article, 331 second, 332 day-parts, 344 standalone
day-parts). The next highest-frequency miss is a **bare time
with no day word**: "at 5pm", "5pm", "at 17:30", "noon",
"at midnight" all returned `undefined` and aborted the phrase —
yet "remind me at 5pm" / "wake me at 7am" is one of the single
most common scheduling utterances.

The grammar required a day head (`today`/`tomorrow`/weekday) or
an `in N <unit>` offset. A bare time fell into the dayPattern's
`[a-z]+` head branch ("at" → `WEEKDAY_INDEX["at"]` undefined) or
didn't match at all ("5pm" starts with a digit), so it resolved
to nothing.

## Scope

`packages/mcp/src/loopback-relative-time.ts` — a pre-check
placed after the standalone-day-part check (344) and **before**
`dayPattern`:

- Strip an optional leading `at ` (`/^at\s+(.+)$/`), feed the
  rest to the existing `parseTimeOfDay`, and on a valid parse
  resolve to **today** at that time (`startOfDay(reference)` +
  `setHours`) — exactly the "today &lt;time&gt;" semantics
  (returns the instant even if already past; the caller /
  firing loop owns past-due, consistent with goals 329/344).
- Reuses `parseTimeOfDay` wholesale, so every time form it
  already supports — `Nam`/`Npm`, `HH:MM`, bare 24h hour
  (329), `noon`/`midnight`, day-parts (332) — now works
  bare-and-day-less for free.

Gated **purely on `parseTimeOfDay` validity**, which is the key
to disjointness: every day word (`today`, `tomorrow`, every
weekday name) is `"invalid"` in `parseTimeOfDay` and falls
through to `dayPattern` unchanged, so the two paths never
overlap. "tomorrow at 5pm" still routes through `dayPattern`
(starts with `tomorrow`, not `at `), so day-headed forms are
untouched. One short WHY comment records the
gated-on-validity disjointness rationale (non-derivable).

## Verify

- `pnpm --filter @muse/mcp test` — 360 pass (was 359; +1).
  New test: `"at 5pm"` / `"5pm"` → today 17:00,
  `"at 17:30"` → today 17:30, `"noon"` → 12:00,
  `"at midnight"` → 00:00, all on the **reference date**
  (today, not tomorrow); `"tomorrow at 5pm"` still → next day
  17:00 (day-headed path unaffected — no regression);
  `"at lunch"` → `undefined` (non-time still unrecognized). The
  full existing relative-time suite (bare-hour / article /
  second / day-parts / standalone-day-parts / Korean /
  out-of-range) stays green — re-ran before adding the test to
  confirm zero regression.
- `pnpm check` — every workspace green (mcp 360, apps/cli 581,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched — deterministic
  input-phrase parsing; the resolved `Date` feeds the
  reminder/task stores. The deterministic regression is the
  rigorous verification.

## Status

done — the relative-time grammar now resolves a bare,
day-less time ("at 5pm" → today 17:00) by reusing
`parseTimeOfDay`, closing the single most common remaining
scheduling-phrasing gap; day-headed and all prior forms are
unchanged (gated on parse validity so the paths are disjoint)
and non-time words still fail safely to `undefined`.
