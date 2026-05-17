# 331 — the relative-time grammar had no `second` unit

## Why

Completes the duration-unit vocabulary on the core JARVIS
input surface (after 329 bare-hour, 330 indefinite-article).
The offset pattern recognised `minute|hour|day|week|month` but
**not `second`**:

```ts
/^in\s+(\d+|an?)\s+(minute|hour|day|week|month)s?$/u
```

"remind me in 30 seconds" / "in 10 seconds" / "in a second"
returned `undefined` and aborted the whole phrase. Seconds is
the only sub-minute unit, and short second-scale delays are an
extremely common quick-reminder phrasing — especially via voice,
where Whisper transcribes "in thirty seconds" verbatim. It was
also the lone gap in an otherwise-complete unit ladder.

## Scope

`packages/mcp/src/loopback-relative-time.ts` — the `in`-offset
match + offset map:

- `second` added to the unit alternation
  (`(second|minute|hour|day|week|month)s?`).
- `unit === "second" ? amount * 1000` prepended to the
  `offsetMs` ladder. Required, not optional: without it a
  matched `second` would fall through the ternary to `0` and
  silently resolve to "now".

Tightest possible change — one regex token + one ms-map entry,
matching the existing full-word unit style exactly (no
ambiguous abbreviations like `m`/`s`, deliberately kept out so
"in 2 m" can't mean minute-or-month). The indefinite-article
support from goal 330 carries over for free ("in a second" →
+1s). Every other unit, the calendar-month branch, and the
`finiteDate` overflow guard are untouched.

## Verify

- `pnpm --filter @muse/mcp test` — 353 pass (assertions added
  to the existing "in N \<unit\>" test): "in 30 seconds" →
  +30s, "in 1 second" → +1s, "in a second" → +1s; the existing
  minute/hour/day/week, calendar-month, bare-hour (329),
  article (330), Korean, and out-of-range suites stay green.
- `pnpm check` — every workspace green (mcp 353, apps/cli 563,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched — deterministic
  input-phrase parsing; the resolved `Date` feeds the
  reminder/task stores, not a model round-trip. The
  deterministic regression is the rigorous verification.

## Status

done — the relative-time grammar now resolves second-scale
delays ("in 30 seconds" → +30s), completing the duration-unit
ladder; the `offsetMs` fall-through-to-zero hazard is closed,
and all prior units/behaviour are unchanged.
