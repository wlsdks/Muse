# 211 — activity feed: a corrupt firedAtMs must not sink the whole feed

## Why

Goal 210's bug class in its direct sibling. `readActivityFeed`
(`personal-activity-feed.ts`) is the unified history feed
behind the **`muse.history` MCP tool**
(`loopback-history.ts:80`) and the **`/api/history` REST
route** (`apps/api/src/history-routes.ts`). Its
`readPatternActivity` reader read the patterns-fired sidecar
via `safeReadJson` (raw, unvalidated by design) and guarded:

```ts
if (typeof row.patternId !== "string"
    || typeof row.firedAtMs !== "number"
    || !Number.isFinite(row.firedAtMs)) return [];
…
whenIso: new Date(row.firedAtMs).toISOString()
```

`Number.isFinite(row.firedAtMs)` only proves the number is
finite; a finite-but-out-of-range ms (`1e30` from a corrupt /
hand-edited `patterns-fired.json`) passes it, then
`new Date(1e30).toISOString()` throws
`RangeError: Invalid time value`.

Worse blast radius than goal 210: `readActivityFeed` runs all
five readers under `Promise.all` (line 171), so one bad
pattern row rejects the whole promise — the entire history
feed dies, **including reminders, proactive, followups, and
episodes**, not just the pattern entries. Both the
LLM-callable `muse.history` tool and `/api/history` go down.

## Scope

- `packages/mcp/src/personal-activity-feed.ts`: in
  `readPatternActivity`'s guard, replace
  `!Number.isFinite(row.firedAtMs)` with
  `!Number.isFinite(new Date(row.firedAtMs).getTime())` (the
  goal-194/210 pattern — validate the Date, not just the
  number). The `typeof !== "number"` clause still
  short-circuits first, so `new Date(...)` is only evaluated
  on a number. A corrupt row is now dropped by the existing
  `flatMap → []`, leaving the rest of the feed intact; the
  surviving `new Date(...).toISOString()` is guaranteed valid.
  No behavior change for valid rows.
- `packages/mcp/test/mcp.test.ts`: new `readActivityFeed`
  test — a temp `patterns-fired.json` with a corrupt
  (`1e30`) + a valid row → the call resolves (no throw) and
  returns only the valid pattern entry with the correct
  `whenIso`.

## Verify

- `pnpm --filter @muse/mcp test` — 338 pass (1 new; existing
  cases unchanged → no regression).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Pure deterministic data-merge helper — no model invoked; the
  test drives `readActivityFeed` directly. No smoke:live
  needed (consistent with goals 194–210).

## Status

done — a corrupt/out-of-range pattern `firedAtMs` is now
dropped from the activity feed instead of throwing an
unhandled `RangeError` that took down the whole `muse.history`
/ `/api/history` surface (all five activity kinds). The
goal-194 "finite ≠ valid Date" guard is now applied to both
patterns-fired consumers (status summary 210, activity feed
211).
