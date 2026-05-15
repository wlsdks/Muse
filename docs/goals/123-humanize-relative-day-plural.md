# 123 — `humanizeRelativeMs` pluralises `day` correctly

## Why

`humanizeRelativeMs(deltaMs)` is the prompt-text formatter for
every `[Active Context]` line (`active_task: due=… (in 3 day(s))`)
and `[Episodic Memory]` line (`(1 day(s) ago, sim=0.40)`). The
trailing `(s)` parenthetical was a stub shortcut from the original
landing — it reads as a placeholder, especially in the singular
case (`"in 1 day(s)"`), and it sits inside *the prompt the model
reads*. Cleaner JARVIS-voice output starts with cleaner prompt
text.

## Scope

- `packages/agent-core/src/time-helpers.ts` `humanizeRelativeMs`:
  - Branch on `days === 1` so the unit reads `day` (singular) vs
    `days` (any other count, including `0` if a future caller
    ever lands there).
  - Past + future paths use the same branch — `"1 day ago"` /
    `"in 1 day"` / `"3 days ago"` / `"in 3 days"`.

## Verify

- Existing `packages/agent-core/test/time-helpers.test.ts` cases
  updated to expect `"in 3 days"` / `"2 days ago"` instead of the
  old `"day(s)"` form.
- New case pins the singular branch explicitly.
- `packages/agent-core/test/episodic-recall.test.ts` updated to
  expect `"(1 day ago, sim=0.40)"`.
- `pnpm --filter @muse/agent-core test` — 514 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- `pnpm smoke:live` — 13/0 (active-context is on the prompt path;
  live round-trip confirms the format change doesn't break tool
  parsing).

## Status

done — every `[Active Context]` / `[Episodic Memory]` line that
mentions days now reads naturally.
