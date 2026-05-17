# 352 — `muse ask --json` produced empty stdout on a stream error (broken JSON contract)

## Why

`muse ask --json` exists for scripting/automation — a JARVIS
that composes (`muse ask --json "…" | jq -r .answer`). The
chat-only fast path streamed correctly and, on a model/provider
**error** (Ollama down, model not pulled, mid-stream 5xx),
printed a human `(error: …)` line to **stderr** and exited 1 —
but it `return`ed **before** the `if (options.json)` payload
block, so in `--json` mode **stdout was empty**.

Consequence: a script doing `muse ask --json … | jq` gets no
JSON at all when the model fails. `jq` errors on empty input;
the script has **no structured way to detect or handle the
model error** — it only sees an exit code and a human-prose
stderr line. The success path emits a rich JSON object; the
error path silently violates that contract. (Goals 320–322 /
349 made the underlying error *message* actionable; this makes
it *machine-consumable* in `--json` mode.)

## Scope

`apps/cli/src/commands-ask.ts` — chat-only stream-error branch:

- New exported pure `renderAskStreamError({ json, query,
  model, answer, error })` → `{ stdout? , stderr? }`. `--json`
  → a parseable `{ query, model, answer, error }` object on
  **stdout** (any partial answer included) + trailing `\n`;
  non-`--json` → the unchanged `\n(error: …)\n` on **stderr**.
  The action calls it and writes whichever stream it returns,
  then `exitCode = 1; return` as before.
- Exported pure (the file's established pattern —
  `consumeAskStream` is exported "so the unit test can drive it
  without spinning up `muse ask`"); the action no longer
  inlines the json/stderr branch.

Behaviour-preserving for the human (non-`--json`) path —
byte-identical stderr line, same exit 1. The only change: in
`--json` mode the error is now a structured stdout object
instead of empty stdout. Scoped to the chat-only fast path (the
concrete, fully-traced bug); the `--with-tools` agent path uses
a different exception-based flow through the outer catch and is
**not** modified here — a separate concern, not claimed fixed.

## Verify

- `commands-ask.test.ts` (already tested the pure helpers) —
  +2 cases: `json:true` → `stderr` undefined, `stdout` is a
  `JSON.parse`-able object exactly equal to
  `{query,model,answer,error}` and ends with `\n`;
  `json:false` → `stdout` undefined, `stderr` is the
  byte-identical `\n(error: …)\n` (human path unchanged).
- `pnpm --filter @muse/cli test` — 601 pass (+2). `pnpm check`
  — every workspace green (apps/cli 603 incl. the test/ glob,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched (the stream
  *consumption* and error *message* are unchanged; only the
  error *rendering* in `--json` mode changed). The deterministic
  helper test is the rigorous verification.

## Status

done — `muse ask --json` now emits a parseable
`{ query, model, answer, error }` object on stdout when the
chat-only stream fails, instead of empty stdout, so scripts can
detect and handle a model failure structurally (`jq -e .error`)
while the human path is byte-identical.
