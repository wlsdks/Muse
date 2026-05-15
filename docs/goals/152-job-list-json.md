# 152 — `muse job list --json`

## Why

`muse job status --json` exists; `muse job list --json` didn't.
Anyone scripting against the CLI ("which jobs failed this
week?", "any background research still running?") had to parse
the formatted line output by hand — and that output is a
deliberately user-friendly mix of glyphs (`✓ ✗ … ?`) and
truncation (`prompt…`). Adding `--json` is the obvious
parity gap.

## Scope

- `apps/cli/src/commands-jobs.ts`:
  - New `--json` flag on `muse job list`.
  - Payload shape:
    ```json
    {
      "dir": "/.../muse/jobs",
      "status": "all" | "running" | "done" | "error" | "unknown",
      "matched": <count>,
      "jobs": [ { "id": "...", "status": "...", "prompt": "..." }, ... ]
    }
    ```
  - When the dir doesn't exist yet, JSON path emits an empty
    `jobs: []` + `matched: 0` (instead of the human-readable
    "No jobs yet" stdout line) so callers can distinguish
    "no jobs" from a parser error.
  - Non-JSON path unchanged.
- `apps/cli/src/commands-jobs.test.ts`:
  - 3 new cases wire `registerJobCommands` to a fake
    `ProgramIO`, seed a temp `MUSE_JOBS_DIR`, and assert the
    payload shape end-to-end:
    - Two jobs (1 done + 1 running) returned in `jobs[]`.
    - `--status running` slices the payload to the matching job
      and tags `status: "running"` on the envelope.
    - Missing dir → empty payload, no stderr.

## Verify

- `pnpm --filter @muse/cli test` — 391 tests pass (6 new).
- `pnpm check` exit 0.
- `pnpm lint` exit 0.
- No real-LLM path touched (`smoke:live` unchanged).

## Status

done — `muse job list` reaches scripting parity with `muse job
status`.
