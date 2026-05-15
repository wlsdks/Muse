# 202 — `muse brief` must surface provider errors (same class as 201)

## Why

Goal 201 fixed the error-swallow in `muse ask`'s fast path
and extracted the reusable `consumeAskStream` drain. The same
bug class lived in `muse brief` — the flagship JARVIS daily
greeting:

```ts
for await (const event of assembly.modelProvider.stream(...) as
    AsyncIterable<{ type: string; text?: string }>) {
  if (event.type === "text-delta" && typeof event.text === "string") {
    io.stdout(event.text);
    composed += event.text;
  }
}
io.stdout("\n");
if (options.speak) await speakAloud(io, composed.trim());
```

Only `text-delta` was handled. A provider `error` event
(Ollama down, model not pulled — goal 176's `ollama pull`
hint, a 5xx) was iterated past, `composed` stayed `""`, and
`muse brief` printed a lone newline and exited **0** — a
silent blank "good morning" for a failed request, with the
actionable adapter error never reaching the user (and a
pointless `speakAloud("")` under `--speak`). For the most
user-facing JARVIS surface, a blank brief on a transient
backend failure is a bad failure mode.

## Scope

- `apps/cli/src/commands-brief.ts`: replace the bespoke
  text-delta-only loop with the goal-201 `consumeAskStream`
  helper (single source of truth for the
  drain-and-surface-errors contract; cross-module import is
  consistent with brief's existing `./program-helpers` /
  `./program` imports). On `error`: write `(error: <msg>)` to
  stderr, `process.exitCode = 1`, `return` before the trailing
  newline / `--speak` — matching goal 201's surfacing and the
  command's own existing `exitCode = 2; return` precondition
  style. Normal streaming (live deltas + accumulation + speak)
  is unchanged.

## Verify

- `pnpm --filter @muse/cli test` — 507 pass (no regression;
  `consumeAskStream` already has 4 direct unit tests from goal
  201, which now also cover brief since it delegates — no new
  untested logic introduced).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Real-LLM path → dog-fooded on real Qwen (ollama/qwen3:8b,
  reasoning off):
  - `muse brief` → streamed a normal Korean JARVIS greeting
    ("진안, 새벽 3시가 지났네요. …") — path unchanged.
  - `muse brief --model ollama/nope-7b` → prints `(error:
    Ollama stream failed with 404: … run \`ollama pull
    nope-7b\` …)` and the node process exits **1** (verified
    unpiped; previously: blank line, exit 0).

## Status

done — `muse brief` now surfaces the provider's actionable
error and exits non-zero on a failed model request instead of
emitting a silent empty greeting. The `consumeAskStream`
contract now backs both `ask` and `brief`.
