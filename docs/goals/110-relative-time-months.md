# 110 — `resolveRelativeTimePhrase` supports `in N month(s)`

## Why

The relative-time resolver feeds `muse.tasks.add` (`dueAt`) and
`muse.calendar.add` (`startsAtIso` / `endsAtIso`) — the surface
the LLM dispatches to when the user says "remind me in three
months to renew the lease" or "schedule the quarterly review in
6 months". The parser supported `minute`, `hour`, `day`, `week`
offsets but **`month`** fell through to "unsupported phrase",
forcing the LLM to either approximate ("90 days") or hand back an
error. Either way, the personal-agent UX cracks on a phrase any
human would type.

## Scope

- `packages/mcp/src/loopback-relative-time.ts`:
  - Extend the `in N <unit>` regex to accept `month` / `months`.
  - The month branch routes through `Date.setMonth(getMonth() +
    N)` so calendar semantics hold (Jan 15 + 1 month → Feb 15,
    not "30 days later"). JS rolls over when the target month is
    shorter than the source day-of-month (Jan 31 + 1 month →
    Mar 3); that's the standard JS behaviour and matches what a
    user typing "remind me in 1 month" expects from a personal
    scheduler.
  - Other units stay on the simpler millisecond offset — the
    week branch already worked because 7 days is unambiguous.
- Header doc-comment lists the new shape.

## Verify

- New `packages/mcp/test/mcp.test.ts` case:
  - `"in 1 month"` from May 10 → June 10, same wall-clock time.
  - `"in 3 months"` → August 10.
  - `"in 12 months"` → next year, May again (year-boundary check).
- `pnpm --filter @muse/mcp test` — 319 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched (resolver is pure).

## Status

done — "remind me in 3 months" now resolves to a real ISO
timestamp the tasks / calendar tools can persist.
