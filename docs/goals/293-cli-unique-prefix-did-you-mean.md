# 293 — "Did you mean" missed common command abbreviations

## Why

The goal-099 unknown-subcommand helper turns `muse statu` into
`Did you mean 'muse status'?`. It grounds the suggestion purely
in `closestCommandName` (Levenshtein within a length-aware cap:
1 edit for ≤3 chars, 2 for 4–7, 3 for 8+).

That tuning catches single-character typos but **misses the
single most common CLI behaviour: prefix abbreviation**. Users
type `muse cal` for `calendar`, `muse sched` for
`scheduler-setup`, `muse anal` for `analytics`. `cal → calendar`
is 5 inserts — far over the cap for a 3-char input — so the
handler printed `unknown command 'cal'` with **no suggestion at
all**, the exact confusing dead-end goal 099 set out to remove,
just for abbreviations instead of typos. Raising the Levenshtein
cap to cover this would pull unrelated commands together
(false suggestions), so the cap is correctly conservative; the
gap is the missing prefix affordance, not the cap.

## Scope

`apps/cli/src/program.ts` — the unknown-subcommand action:

- Add `uniqueCommandPrefix(input, names)`: when Levenshtein finds
  nothing, suggest a command **only if exactly one** known
  command starts with the typed string (case-insensitive, min 2
  chars). An ambiguous prefix (`re` → recall / remember /
  remind) stays silent — a wrong guess is worse than none, the
  same principle `closestCommandName` already states.
- Wire it as the fallback:
  `closestCommandName(...) ?? uniqueCommandPrefix(...)`.
  Levenshtein still wins when it matches, so every existing
  suggestion is unchanged. One short WHY comment records the
  abbreviation rationale.

Purely additive — the suggestion only ever appears in *more*
cases (a previously-silent unique prefix), never changes or
removes an existing one, and never fires on an ambiguous prefix.

## Verify

- `pnpm --filter @muse/cli test` — 563 pass (was 561; +2). New:
  `muse cal` → `Did you mean 'muse calendar'?` (exit 1);
  `muse re` (ambiguous) → `unknown command 're'` with **no**
  "Did you mean". The existing goal-099 tests stay green:
  `muse statu` still → `muse status` (Levenshtein, unchanged),
  `muse totally-unrelated-input` still → no suggestion (no
  command has that prefix either).
- `pnpm check` — every workspace green (apps/cli 563,
  apps/api 160, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (deterministic CLI
  argument-suggestion logic). A live Qwen run cannot exercise
  unknown-subcommand resolution, so the deterministic tests are
  the rigorous verification.

## Status

done — `muse <unique-prefix>` now answers with the intended
command (`cal` → `calendar`, `sched` → `scheduler-setup`)
instead of a dead-end error, while ambiguous prefixes and the
existing Levenshtein typo suggestions are unchanged.
