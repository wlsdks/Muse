# 255 — `muse today` buried imminent task deadlines under recent captures

## Why

`compareTasksByDueDate` exists specifically to fix one UX failure
— its own doc says: *"the previous default (creation-date desc)
buried last week's hard deadline behind today's quick capture"*.
`muse tasks list` was switched to it
(`commands-tasks.ts:112 .sort(compareTasksByDueDate)`).

But `muse today` / `muse brief` — the **daily briefing**, the
primary "what should I focus on?" surface — was never updated.
`readOpenTasks` in `commands-today.ts` still did:

```ts
.filter((task) => task.status === "open")
.sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
.slice(0, 50)
```

Creation-date descending, then `slice(0, 50)`. So a task due in
two hours but created weeks ago sorts *below* every quick-capture
made since — and with more than 50 open tasks it is **truncated
out of the briefing entirely** while 50 recent trivia fill the
list. A daily briefing whose task section doesn't lead with what's
due soonest defeats its purpose, and it was inconsistent with
`muse tasks list` and the comparator's documented intent.

## Scope

`apps/cli/src/commands-today.ts`:

- Import `compareTasksByDueDate` from `@muse/mcp` (already the
  source of `readTasks` / `serializeTask` here; the comparator is
  exported there and is what `muse tasks list` uses).
- `readOpenTasks` now `.sort(compareTasksByDueDate)` before
  `.slice(0, 50)`, so the 50 surfaced tasks are the most
  due-relevant and are ordered due-soonest → latest, then undated
  newest → oldest (the comparator's tie-break). One sort line
  changed; the `{ id, title }` output shape and every other
  section are untouched.

No verification gate weakened; behaviour for the common
(few-tasks) case only changes ordering, and for the >50-task case
it stops dropping imminent deadlines.

## Verify

- `pnpm --filter @muse/cli test` — 557 pass (was 556; +1). New
  test plants five tasks via the `today --local --json` harness:
  an imminent-due task created long ago, a far-due recent task,
  two undated (new + old), and a done one; asserts the briefing's
  `tasks` order is `["t_soon", "t_far", "t_new_undated",
  "t_old_undated"]` (done excluded) — pre-fix the createdAt-desc
  sort put the recent far-due / new-undated task ahead of the
  imminent `t_soon`. The existing followups / empty-state
  `today --local` tests stay green.
- `pnpm check` — every workspace green (apps/cli 557, apps/api
  155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (pure deterministic
  store-read + sort feeding the aggregation; `--brief`'s model
  call consumes the ordering, it is not the ordering). The
  `--local --json` deterministic test is the rigorous
  verification.

## Status

done — the daily briefing now leads with the tasks that are
actually due soonest, consistent with `muse tasks list` and the
`compareTasksByDueDate` contract, so an imminent deadline can no
longer be buried (or sliced away) behind recent quick-captures in
the surface a user checks every morning.
