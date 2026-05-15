# 207 — `muse chat -i` fast path must surface provider errors

## Why

Concluding the goal 201–205 error-swallow sweep on the
**primary interactive surface**, `muse chat -i` (the JARVIS
REPL). The per-prompt body is wrapped in
`try { … } catch (error) { io.stderr(\`(error: ${msg})\n\`) }`
(chat-repl.ts:374/501). It has two model paths:

- **Agent-runtime path** (`agentRuntime.stream`,
  tools-enabled): the runtime *throws* provider errors
  (`model-loop.ts: throw event.error`), so the throw
  propagates to the line-501 catch — the error is shown and
  the throw skips the history-persistence lines. **Correct.**
- **Chat-only fast path** (`modelProvider.stream`,
  `--no-tools`): drained handling only `text-delta`. A
  provider `error` event is not an exception, so the loop
  iterated past it, `accumulated` stayed `""`, the catch was
  never reached, and execution fell through to push
  `{ role: "assistant", content: "" }` into `history` **and**
  `appendLastChatTurn({ message, response: "" })`.

So on a provider failure (Ollama down, model not pulled —
goal 176's `ollama pull` hint, a 5xx) the fast-path REPL
showed the user a blank turn with no error **and persisted an
empty assistant turn** into `history` + `last-chat.jsonl` —
which then feeds episodic-memory extraction / compaction.
Worse than the one-shot commands: it silently corrupts
conversation memory with empty turns. The two paths in the
same function were inconsistent.

## Scope

- `apps/cli/src/chat-repl.ts`: in the fast-path `for await`,
  an `event.type === "error"` now **throws** the unwrapped
  provider error — routing into the *pre-existing,
  already-correct* line-501 `catch` (which prints
  `(error: …)` and continues the REPL), exactly mirroring the
  agent-runtime path. The throw skips the history /
  `last-chat.jsonl` writes, so no empty turn is persisted. No
  new error-handling code; same proven pattern as goal 205
  (throw the error event into the existing catch). The
  fire-and-forget auto-extract block (its own documented
  fail-open `catch`) and `compactHistory` (already guarded by
  its empty-summary bail) are intentionally untouched —
  swallowing there is by-design fail-safe, not the bug.

## Verify

- `pnpm --filter @muse/cli test` — 508 pass (no regression).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Verification scope (transparent): `runChatRepl` hardcodes
  `input: process.stdin` and has no non-interactive / test
  input seam, and piped stdin does not deliver turns in this
  environment — so the interactive REPL turn loop cannot be
  driven for a direct real-Qwen dog-food (the same
  not-in-process-drivable situation goal 205 had with the
  `process.exit` job-worker subprocess). The fix is sound by
  construction: (a) the provider `error` event for a bad
  Ollama model was already dog-fooded end-to-end on real Qwen
  this session — goals 201 & 204 (`Ollama stream failed with
  404 … run \`ollama pull …\``) and 205; (b) it is now routed
  into the **same line-501 catch the agent-runtime path
  already uses and relies on** for its thrown provider errors
  (established working behavior). No new/unexercised code path
  is introduced; the change makes the fast path consistent
  with the proven one.

## Status

done — the `muse chat -i --no-tools` fast path now surfaces
the provider's actionable error and continues the REPL
*without* persisting an empty assistant turn, identical to the
agent-runtime path. The error-swallow sweep (ask 201, brief
202, remember 203, read 204, job-worker 205, chat-repl 207) is
complete across the one-shot, background, and interactive
surfaces; `chat-history` compaction was reviewed and is
already fail-safe (no change needed).
