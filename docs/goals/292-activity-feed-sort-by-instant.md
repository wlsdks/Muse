# 292 — merged activity feed sorted by raw ISO string (281/290/291 sibling)

## Why

`readActivityFeed` (`@muse/mcp`) is the unified "what happened
recently" surface — it **merges** entries from five independent
sources (reminder history, proactive history, followups,
patterns-fired, episodes) and is read by `muse status`/history
CLI + REST + the proactive loop. Each source builds `whenIso`
differently:

- patterns-fired → `new Date(row.firedAtMs).toISOString()`
  (canonical `…sssZ`)
- episodes → `row.endedAt` (**raw passthrough**, any ISO form)
- reminder / proactive history → `row.firedAtIso` (whatever the
  writer stored)

So the merged array holds **heterogeneous ISO forms**. The
time-window filter already compares correctly via
`Date.parse(entry.whenIso)` (line 179) — but the very next line
sorted with:

```ts
merged.sort((left, right) => right.whenIso.localeCompare(left.whenIso));
```

Lexicographic ISO order is wrong across mixed precision
(`"…00.500Z"` sorts before `"…00Z"`) and timezone offsets
(`"…18:00+09:00"` = `09:00Z` sorts after `"…10:00Z"`), so the
feed was **interleaved out of true chronological order** — a
newer event could appear older. An internal inconsistency
(instant filter, string sort) and the same silent-wrong the loop
closed for the inbox cursor (281), tasks (290), and reminders
(291).

## Scope

`packages/mcp/src/personal-activity-feed.ts`:

- Sort by `Date.parse` instant, newest-first; equal instants and
  unparseable values keep the prior deterministic order
  (`localeCompare` fallback / stable `0`), matching the
  instant-based window filter directly above it. One short WHY
  comment records the heterogeneous-source rationale; the module
  doc's "Sort:" line updated to state instant-based ordering.

Behaviour-preserving for canonical `…sssZ` entries
(instant-descending == the prior lexicographic-descending
result); only mixed precision / offset and equal-instant
stability change (correctly).

## Verify

- `pnpm --filter @muse/mcp test` — 347 pass (was 346; +1). New
  regression: an episodes file (raw `endedAt` passthrough) with
  `…09:00:00.500Z`, `…09:00:00Z`, and `…18:00:00+09:00`
  (= `09:00Z`) → feed ordered `["newest-ms","utc","offset"]`
  (newest instant first; the equal-instant pair stable in file
  order). Pre-fix `localeCompare` returned
  `["offset","utc","newest-ms"]` — the newest event sorted
  **last**. The existing corrupt-`firedAtMs` activity-feed test
  stays green.
- `pnpm check` — every workspace green (mcp 347, apps/cli 561,
  apps/api 160, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (pure deterministic
  merge/sort). A live Qwen run cannot reproduce a
  mixed-precision / offset feed on demand, so the deterministic
  regression is the rigorous verification — same stance as
  siblings 281 / 290 / 291 and 261 / 274–289.

## Status

done — the merged activity feed now orders by the real event
instant, so heterogeneous ISO forms across the five sources can
no longer interleave "recent activity" out of chronological
order. The window filter and sort now use the same instant basis;
canonical-ISO ordering is unchanged. This closes the
raw-string-ISO-compare bug class across every personal-data
surface (cursor / tasks / reminders / activity feed).
