# 205 — job-worker fast path must record provider errors (not false `done`)

## Why

Concluding the goal 201–204 error-swallow sweep with its worst
variant. `job-worker.ts` (the detached background worker
`muse job run` spawns) has an outer `try/catch` that, on a
thrown error, appends `{ type: "error", text }` to the job
JSONL and `process.exit(1)`. The `agentRuntime.run` path
throws provider errors, so it's recorded correctly. But the
`--no-tools` chat-only fast path drained `modelProvider.stream`
handling only `text-delta`:

```ts
for await (const event of assembly.modelProvider.stream(...)) {
  if (event.type === "text-delta") { … appendEvent(progress) }
}
```

A provider `error` event is **not** an exception — the stream
yields it and ends normally. So the loop iterated past it, no
throw occurred, the outer catch was skipped, and execution
fell through to `appendEvent({ type: "done" })` +
`process.exit(0)`. A background job that failed at the provider
level (Ollama down, model not pulled — goal 176's hint, a 5xx)
was recorded as **`done` with zero output and exit 0** — a
*false success in the job audit trail*. `muse job status`
would report the job complete; any automation reading the
JSONL gets an empty result with no error. Strictly the worst
form of the bug class: not a blank screen, a fabricated
success.

## Scope

- `apps/cli/src/job-worker.ts`: in the fast-path `for await`
  loop, an `event.type === "error"` now **throws** the
  provider error (unwrapping `event.error`). This routes into
  the *existing, already-correct* outer catch — which appends
  `{ type: "error", text }` and `process.exit(1)` — making the
  fast path behave identically to the `agentRuntime` path. No
  new error-recording code; the awaited per-delta JSONL writes
  are unchanged (so `consumeAskStream`, whose sync `onDelta`
  doesn't fit the awaited-append pattern, was deliberately not
  reused here). Normal streaming is unchanged.

## Verify

- `pnpm --filter @muse/cli test` — 507 pass (no regression).
  job-worker is a `process.exit`-ing subprocess entrypoint
  (top-level `await main()`, no exported fn) — not in-process
  unit-testable without a refactor beyond this fix's scope; it
  routes into the existing catch path already exercised by the
  `agentRuntime not available` throw.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Real-LLM path → dog-fooded by spawning the actual worker
  the way `commands-jobs.ts` does (real Qwen, ollama/qwen3:8b,
  reasoning off):
  - normal `--job-no-tools` job → JSONL `started` →
    `progress`("P") → `progress`("ONG") → `done`, worker
    exit **0**.
  - bad-model `--job-no-tools` job → JSONL `started` →
    `error`("ModelProviderError: Ollama stream failed with
    404 … run \`ollama pull …\`"), **no `done`**, worker exit
    **1** (previously: `started` → `done`, exit 0).

## Status

done — a failed model request in the `--no-tools` background
job path is now recorded as an `error` event with the
actionable provider message and the worker exits non-zero,
instead of fabricating a `done`/exit-0 success. The
error-swallow sweep (ask 201, brief 202, remember 203, read
204, job-worker 205) is complete for the one-shot/background
surfaces; `chat-history` and `chat-repl` (interactive,
multi-site) remain.

Noted out of scope: `muse job run --no-background` is rejected
by commander ("unknown option") though the help text
advertises it — a separate latent jobs-CLI bug for a future
iteration.
