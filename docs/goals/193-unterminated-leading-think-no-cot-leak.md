# 193 — a leading `<think>` with no close must not leak raw CoT

## Why

`stripLeadingThinkBlock` (non-stream) and
`createLeadingThinkStripper` (stream) are the reasoning=false
defense-in-depth: a Qwen3-class model whose think-suppression
switch was ignored leaks a leading `<think>…</think>` before
the answer; both helpers strip it.

They **disagreed** on the unterminated case:

- `createLeadingThinkStripper` → `""` for a leading `<think>`
  that never closes (truncated reasoning).
- `stripLeadingThinkBlock` → returned the raw text **unchanged**
  ("leave it intact rather than nuke everything").

At `packages/agent-core/src/model-loop.ts:343` the streamed
final response is `event.response.output || streamedOutput`.
For a leading `<think>` with no `</think>` (the model spent its
whole budget reasoning and got cut off, no answer):

- `event.response.output` = `stripLeadingThinkBlock(raw)` =
  the raw `<think>reasoning…` text (truthy) → **wins**.
- `streamedOutput` = `""` (the streaming stripper swallowed it).

Result: the user gets the **raw chain-of-thought dumped into
chat** — exactly what reasoning=false + this whole machinery
exists to prevent — while a live-delta consumer sees a blank
reply. Two wrong behaviors that contradict each other.

The "don't nuke everything" rationale only applies when there
is a real answer to preserve. A *leading* `<think>` with **no
closing tag anywhere** is 100% leaked reasoning — there is no
answer portion. Leaving it intact is strictly a CoT leak.

## Scope

- `packages/model/src/provider-shared.ts`: after the
  complete-block regex misses, if the text still starts with
  optional-whitespace + `<think>`, return `""`. A *closed*
  `<think>…</think>` followed by a truncated answer is
  unaffected (the regex matches the closed block and the
  partial answer is preserved). A `<think>` later in
  prose/code is untouched (still anchored at `^\s*<think>`).
  Doc comment rewritten to state the refined contract + WHY.
- `packages/model/test/model.test.ts`: the existing test
  *encoded the bug* ("leaves an unterminated block intact") —
  rewritten to assert `""`, to assert it now agrees with the
  streaming stripper, and a new test proves a partial answer
  after a CLOSED block is still preserved (the case the old
  rationale actually cared about).

## Verify

- `pnpm --filter @muse/model test` — 139 pass (5 skipped:
  no-key live).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Real Qwen round-trip (response path touched):
  `OLLAMA_BASE_URL=… MUSE_MODEL=ollama/qwen3:8b GEMINI_API_KEY=""
  muse ask "Reply with exactly: PONG"` → `PONG` — normal
  answer path intact, no `<think>` leak, no regression.

## Status

done — the two think-strippers now agree for the unterminated
leading case; a truncated reasoning-only response yields ""
(honoring reasoning=false) instead of leaking raw
chain-of-thought through the streamed final output. The
closed-block-then-truncated-answer guarantee is preserved.
