# 232 — `muse orchestrate` numeric flags strict (max-workers + limit)

## Why

The multi-agent orchestration CLI was the last command off
the strict-numeric line (177 / 178 / 179 / 184 / 188 / 192 /
215 / 224 / 225). Two flags:

- `orchestrate run --max-workers`:
  `Number.parseInt(options.maxWorkers, 10)` then
  `if (!Number.isInteger || <= 0) throw "must be a positive
  integer"`. The guard rejects `abc` / `0` / `-1`, but
  `Number.parseInt("3abc", 10) === 3`, so a unit slip
  `--max-workers 3abc` **silently engaged 3 workers** — the
  exact `parseInt`-trailing-garbage hole the strict line
  uses `Number()` to close. The message also didn't show the
  bad input or the valid range.
- `orchestrate list --limit`: the raw string was
  `encodeURIComponent`-forwarded straight into
  `?limit=<raw>` with **zero client-side validation** — a
  garbage `--limit abc` hit the API unfiltered.

For a JARVIS multi-agent capability, a silently-wrong worker
count / list limit is a silently-wrong result with no signal.

## Scope

- `apps/cli/src/commands-orchestrate.ts`: reuse the exported
  `parseBoundedInt` (`commands-ask.ts`, goal 178 — the same
  cross-command import precedent as goals 202 / 203 / 204 /
  230):
  - `--max-workers` → `parseBoundedInt(opt, "--max-workers",
    1, 64, 1)` when present (still omitted from the payload
    when absent). Replaces the bespoke parseInt+guard — now
    rejects `3abc` and clamps high, with an actionable
    message.
  - `--limit` → `parseBoundedInt(opt, "--limit", 1, 500, 20)`
    when present (added the missing validation), sending a
    clean numeric limit instead of the raw string.
  Absent flags behave exactly as before (omitted / no query
  param); valid values are unchanged.

## Verify

- `pnpm --filter @muse/cli test` — 536 pass (no regression;
  `parseBoundedInt` already has 4 direct unit tests from goal
  178 covering the contract both call sites delegate to — no
  new untested logic).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Dog-fooded the real command (the parser throws before any
  `apiRequest`, so this is deterministic / immediate — same
  stance as the rest of the strict line):
  - `orchestrate run --max-workers 3abc "do x"` → stderr
    `muse: --max-workers must be an integer in [1, 64] (got
    '3abc')`, exit **1** (was: silent 3 workers).
  - `orchestrate list --limit abc` → stderr `muse: --limit
    must be an integer in [1, 500] (got 'abc')`, exit **1**
    (was: forwarded `?limit=abc` raw to the API).
  - `orchestrate run --max-workers 4 "do x"` → parse passes;
    the API returns a 409 `NO_AGENT_WORKERS` (no specs in
    this env) — confirming the valid value flows through
    unchanged.

## Status

done — every numeric CLI flag on the strict-numeric line,
including the multi-agent orchestration command, now rejects
a typo / unit-slip / out-of-range value with an actionable
message instead of silently substituting or forwarding it.
The strict-numeric consistency line is complete across the
CLI surface.
