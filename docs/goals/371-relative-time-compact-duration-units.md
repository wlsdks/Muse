# 371 — relative-time grammar rejected compact duration units ("in 1h")

## Why

Empirically probing the relative-time grammar (the JARVIS-core
natural-language scheduling surface behind `parseTaskDueAt`,
reminders, and the loopback MCP tools) surfaced a concrete
**inconsistency**, not an ambiguous-phrase judgement call:

```
in 1 hour      → 2026-05-18T10:00:00Z   (handled)
in 30 minutes  → 2026-05-18T09:30:00Z   (handled)
in 1h          → —                       (REJECTED)
in 30m         → —                       (REJECTED)
in 2d / in 1w / in 15s / in 3 hr / in 5 hrs / in 10 mins → all REJECTED
```

Only the fully-spelled unit form parsed. The compact unit-suffix
form (`1h`, `30m`, `2d`, `15s`, `1w`) and common abbreviations
(`hr`/`hrs`, `min`/`mins`, `sec`/`secs`) were unrecognised — even
though that notation is unambiguous, deterministic, extremely
common, and is literally the syntax of the project's own `/loop`
interval grammar (`Nm`/`Nh`/`Nd`/`Ns`). A user typing
`muse remind add "ping" --at "in 1h"` got a hard rejection while
`"in 1 hour"` worked. Unlike the deliberately-rejected vague
phrases (`a few`, `couple`, `this weekend`, `next week`,
`end of month`), this is a precise quantity the grammar simply
didn't accept in its short form.

## Scope

`packages/mcp/src/loopback-relative-time.ts`: one new handler added
**after** the full-word `inMatch` block and before the fractional
handler:

```ts
/^in\s+(\d+)\s*(secs?|s|mins?|m|hrs?|h|d|w)$/u
```

- `m` = minute, matching the project's `/loop` grammar; **no month
  abbrev** (`mo` collides with `m`, and the codebase rejects
  ambiguous phrases — month stays full-word-only via the existing
  handler).
- Optional space (`\s*`) so both `in 1h` and `in 1 h` parse.
- Reuses `finiteDate(...)` so a huge amount overflowing past
  ±8.64e15 ms returns `undefined`, identical to the existing
  offset handler.

**Zero-regression by construction:** the new branch sits after every
prior handler, so it can only fire on inputs that currently fall
through to `undefined`; it is provably disjoint from the full-word
handler (which requires `\s+` + a spelled-out unit), the
`and a half` handler (different suffix), the fractional handler
(words not digits), and the Korean handler (runs earlier).

## Verify

Empirically verified against the built module **before** writing
assertions — all compact forms resolve correctly; every existing
phrase (`in 1 hour`, `in 2 days`, `in 1 month` calendar-month,
`in half an hour`, `in 2 hours and a half`, `in a minute`,
`tomorrow 9am`, `next monday`, `day after tomorrow`) is byte-for-byte
unchanged; and `in 5mo` / `1h` / `in h` / `in 3 horses` /
`information` correctly stay `undefined` (no false positives, the
`^in\s+` anchor prevents substring matches).

- `pnpm --filter @muse/mcp test` — 364 pass (+1; new compact-form
  `it` with the verified values + disjointness/no-regression
  asserts).
- `pnpm check` — every workspace green (apps/cli 647, apps/api 165,
  all packages).
- `pnpm lint` — exit 0.
- goal-227/328 byte scan clean on both touched files.
- No real-LLM request/response path touched — `resolveRelativeTimePhrase`
  is a pure deterministic parser (consistent with the 356/358/362
  relative-time goals, which are deterministic). The deterministic
  suite plus pre-write empirical dist verification is the rigorous
  verification.

## Status

done — the relative-time grammar now accepts the compact
unit-suffix duration form (`in 1h`, `in 30m`, `in 2d`, `in 15s`,
`in 1w`) and the `hr`/`hrs`/`min`/`mins`/`sec`/`secs` abbreviations,
closing the inconsistency where only the fully-spelled form parsed,
with zero regression to any existing phrase and no new false
positives.
