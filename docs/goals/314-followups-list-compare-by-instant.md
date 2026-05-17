# 314 — followups list sorted by raw ISO string (last ISO-compare sibling)

## Why

`muse.followups.list` (`@muse/mcp` loopback) is the surface the
agent reads to answer "what follow-ups are scheduled?" — it
presents them soonest-first. It sorted with the inline:

```ts
.sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))
```

`PersistedFollowup.scheduledFor` is a free-form `string`. The
snooze path normalises via `parseReminderDueAt` and the detector
emits `Date.toISOString()`, but a hand-edited
`~/.muse/followups.json` / import need not be canonical, so
lexicographic ISO order is wrong across mixed precision
(`"…00.500Z"` sorts before `"…00Z"`) and timezone offsets
(`"…18:00+09:00"` = `09:00Z` sorts after `"…10:00Z"`) — the
list surfaces the **wrong followup as most imminent**. This is
the final untreated instance of the raw-string-ISO-compare class
closed for the inbox cursor (281), tasks (290), MCP reminders
(291), activity feed (292), and REST reminders (301).

## Scope

`packages/mcp/src/personal-followups-store.ts`:

- Add an exported `compareFollowupsByScheduledFor`, parallel to
  `compareRemindersByDueAt` / `compareTasksByDueDate`: compare
  `Date.parse` instants (soonest first); equal instants break to
  newest-created-first via `createdAt`-desc; unparseable values
  keep the prior `localeCompare` order. One short WHY comment
  records the free-form-string / mixed-format rationale.
  Re-exported from the `@muse/mcp` barrel.

`packages/mcp/src/loopback-followups.ts`:

- `muse.followups.list` now `.sort(compareFollowupsByScheduledFor)`
  instead of the inline `scheduledFor.localeCompare`.

Behaviour-preserving for canonical `…Z` followups (instant order
== the prior lexicographic result); the followups list now
orders by the same "soonest, ties→newest-created" rule as every
task/reminder surface.

## Verify

- `pnpm --filter @muse/mcp test` — 349 pass (was 347; +2). New
  `compareFollowupsByScheduledFor` tests: a `+09:00` earliest
  instant that string-sorts last and a `…00.500Z` entry order by
  true instant; an equal-instant pair (`…09:00Z` vs
  `…18:00+09:00`) breaks to newest-created. The existing
  followups list / snooze / cancel and the sibling
  reminder/task comparator tests stay green.
- `pnpm check` — every workspace green (mcp 349, apps/cli 563,
  apps/api 161, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (pure deterministic
  comparator). A live Qwen run cannot reproduce a
  mixed-precision / offset `scheduledFor` on demand, so the
  deterministic regression is the rigorous verification — same
  stance as siblings 281 / 290 / 291 / 292 / 301.

## Status

done — `muse.followups.list` now orders by the real scheduled
*instant* via the shared `compareFollowupsByScheduledFor`,
closing the last raw-ISO-compare instance and making the
followups list consistent with task / reminder ordering.
Canonical-ISO ordering is unchanged. The raw-string-ISO-compare
class is now fully closed across every personal-data surface.
