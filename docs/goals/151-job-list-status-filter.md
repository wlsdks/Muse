# 151 — `muse job list --status <state>`

## Why

`muse job list` always returns every job in `~/.muse/jobs/`,
newest-first. Once the dir accumulates a few weeks of work the
real question becomes "is *anything still running*?" — and the
user has to eyeball every line for the `…` glyph.

Adding a `--status` filter lets the user ask directly:

```bash
muse job list --status running   # what's still going
muse job list --status error     # what blew up
muse job list --status done      # what landed cleanly
```

## Scope

- `apps/cli/src/commands-jobs.ts`:
  - New `JOB_STATUS_FILTER_VALUES = ["all", "running", "done",
    "error", "unknown"]` tuple — single source of truth.
  - New pure helper `resolveJobStatusFilter(input)` →
    `JobStatusFilter | "invalid"`. Case-insensitive, trims
    whitespace, empty / undefined → `"all"` (no filter).
  - `muse job list --status <state>` option.
  - Bad value → fuzzy-suggest via the goal-099
    `closestCommandName` (e.g. `--status runing` → "did you mean
    'running'?") + lists the valid set + exits 1.
  - The matched-count line tags the active filter so the user can
    see the slice (e.g. `3 job(s) in /…/jobs (status=running):`).
- `apps/cli/src/commands-jobs.test.ts` (new):
  - 5 cases covering undefined / empty / case-normalisation / each
    known value / invalid input / surrounding whitespace.

## Verify

- `pnpm --filter @muse/cli test` — 385 tests pass (10 new in
  `commands-jobs.test.ts`).
- `pnpm check` exit 0.
- `pnpm lint` exit 0.
- No real-LLM path touched (`smoke:live` unchanged).

## Status

done — narrow scan of "what's running right now" is a single
flag away.
