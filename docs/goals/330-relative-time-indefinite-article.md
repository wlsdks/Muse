# 330 — "in an hour" / "in a minute" failed the relative-time grammar

## Why

Adjacent to goal 329 (bare hour), on the same core JARVIS input
surface. `resolveRelativeTimePhrase`'s offset pattern was:

```ts
/^in\s+(\d+)\s+(minute|hour|day|week|month)s?$/u
```

It required a **digit**. The indefinite-article forms — "in an
hour", "in a minute", "in a day", "in a week", "in a month" —
are among the most common ways a person (and a voice
transcript) states a short delay, and every one of them fell
through to `undefined`, aborting the whole phrase. "Remind me
in an hour" simply did not work.

## Scope

`packages/mcp/src/loopback-relative-time.ts` — the `in`-offset
match:

- Quantity group widened from `(\d+)` to `(\d+|an?)`; when the
  captured quantity is `a` or `an`, the amount is `1`,
  otherwise `Number.parseInt`. Everything downstream (flat-ms
  units, calendar-month semantics for `month`, the `finiteDate`
  out-of-range guard) is reused unchanged.

Tightest possible change — a single regex alternative plus a
two-line amount resolution. The numeric form is byte-identical
(`\d+` still parses exactly as before); only previously-`undefined`
article inputs now resolve. Vague quantifiers ("in a few
minutes") still correctly return `undefined` — "few" is neither
`\d+` nor `an?`. No comment needed: the `=== "a" || === "an" ?
1` is self-evident.

## Verify

- `pnpm --filter @muse/mcp test` — 353 pass (was 352; +1). New
  test: "in a minute" → +1m, "in an hour" → +1h, "in a day" →
  +1d, "in a week" → +7d, "in a month" → calendar +1 month,
  "in 2 hours" still +2h (numeric no-regression), "in a few
  minutes" → `undefined` (vague quantifier still unrecognized).
  The existing "in N unit" / calendar-month / out-of-range /
  bare-hour (329) / Korean suites stay green.
- `pnpm check` — every workspace green (mcp 353, apps/cli 563,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (goal 328) stays green.
- No real-LLM request/response path touched — deterministic
  input-phrase parsing; the resolved `Date` feeds the
  reminder/task stores, not a model round-trip. The
  deterministic regression is the rigorous verification.

## Status

done — the relative-time grammar now accepts the indefinite
article as quantity 1 ("in an hour" → +1h), closing another
very common JARVIS phrasing gap, with the numeric form and all
prior behaviour unchanged and vague quantifiers still rejected.
