# 279 — Ollama native stream dropped an unterminated final NDJSON line

## Why

`OllamaProvider.stream` is the project's **primary provider
path** — the user runs Qwen exclusively through local Ollama, and
this override exists specifically so `think:false` suppresses
chain-of-thought. It reads Ollama's native `/api/chat` response,
which is newline-delimited JSON (NDJSON), with a line-splitter:

```ts
while (true) {
  const { done, value } = await reader.read();
  if (done) break;                        // <-- exits with buf possibly non-empty
  buf += decoder.decode(value, { stream: true });
  for (;;) {
    const i = buf.indexOf("\n");
    if (i === -1) break;                  // <-- a line with no "\n" is never parsed
    …handle line…
  }
}
// buf was never drained, decoder never flushed
```

If the terminal `done:true` chunk arrives **without a trailing
newline** (NDJSON producers are not required to emit one, and a
socket can close right after the final `}`), `buf.indexOf("\n")`
is `-1`, the inner loop never parses it, the outer loop sees
`done` and breaks, and the buffer is discarded. That terminal
line carries `eval_count` / `prompt_eval_count` (the **token
usage**) and can carry the last content / `tool_calls`. So a
missing `\n` silently produced an answer with lost trailing text,
**no usage**, and potentially a dropped tool call — on every
provider call where it happens. The TextDecoder was also never
finally flushed (a multibyte char split across the last chunk
boundary would be lost).

## Scope

`packages/model/src/adapter-ollama.ts` — `stream()`:

- Factor the per-line handling into a local `handleLine`
  generator (closes over `output` / `lastJson` /
  `streamedToolCalls` / `seenToolKeys` / `toolFallbackIndex` /
  `stripThink`; byte-identical logic, the old `continue`-on-parse-
  fail becomes `return` from the generator).
- After the read loop, `buf += decoder.decode()` (final flush)
  then split the residual on `\n` and run `handleLine` on each
  non-empty line. One short WHY comment records the
  no-guaranteed-trailing-newline rationale.

Behaviour-preserving for the normal newline-terminated stream
(the residual buffer is empty / whitespace → the post-loop drain
is a no-op); only the previously-dropped unterminated final line
is now parsed. No API change.

## Verify

- `pnpm --filter @muse/model test` — 145 pass (5 pre-existing
  skips). New regression: a stream whose terminal `done:true`
  chunk (content `"lo"` after a `"hel"` delta, plus
  `eval_count`/`prompt_eval_count`) has **no** trailing newline —
  asserts the joined text is `"hello"`, the `done` response
  `output` is `"hello"`, and `usage` is
  `{inputTokens:7, outputTokens:3}` (pre-fix: text `"hel"`, no
  usage). The existing tool-call-in-done:false-chunk and all
  other Ollama streaming tests stay green (normal path
  unchanged).
- `pnpm check` — every workspace green (model 145, apps/cli 561,
  apps/api 160, all packages). `pnpm lint` — exit 0.
- Real-LLM request/response path touched (the streaming hot loop
  was restructured) → dog-fooded a real Qwen round-trip:
  `OllamaProvider.stream` against local Ollama `qwen3:8b`
  (`http://127.0.0.1:11434`, `think:false`, no Gemini/paid key).
  Streamed `"PONG"` in ~1.9 s with the `done` event carrying
  `output: "PONG"` and `usage: {inputTokens:22, outputTokens:3}`
  — the normal newline-terminated NDJSON path (incl. the terminal
  usage line) still works end-to-end, confirming no regression
  from the refactor. The unterminated-line edge itself can't be
  forced against a real Ollama (it always sends the newline), so
  the deterministic regression test is its rigorous verification.

## Status

done — the Ollama native stream now drains its buffer and flushes
the decoder after the read loop, so a terminal NDJSON line with no
trailing newline (final content, tool calls, and token usage) is
no longer silently dropped on the project's primary provider path.
Normal streaming is unchanged and verified live against Qwen.
