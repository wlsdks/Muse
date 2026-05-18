# 378 — Knows-you · anticipates · asks (OUTWARD-TARGETS P0)

Category: epic / outward (P0 — foundational; interwoven with P1)

## Why

Falsifiable-outward: after P0 ships, Muse **learns the user from
real use across every surface** (not just the REPL chat-only path)
and applies what it learns — so the just-delivered channel
conversation (P1) is no longer "hollow." Exercised by: talk to
Muse on a wired channel / the API with tools, then see a stated
fact/preference influence a later answer.

## Slices (the P0 bullets)

1. **Auto-extract on the API runtime + tool-using turns** — the
   user model grows from real use, including channel chats.
2. **Embedding-similarity recall + preferences actually applied** —
   a stored preference changes a differently-worded later answer.
3. **Infer an unstated need and surface it unasked** — from
   calendar / inbox / patterns context.
4. **Ask a clarifying question instead of guessing** on an
   ambiguous request.

## Verify

- Per slice: the bullet's mandated integration check green +
  `pnpm check` + `pnpm lint` 0/0.

## Status

slice 1 done — flips OUTWARD-TARGETS **P0-b1**. The auto-extract
hook (`createUserMemoryAutoExtractHook`, `afterComplete` —
tool-agnostic) was ALREADY wired into the API AgentRuntime via the
assembly (`autoconfigure/index.ts` `runtimeHooks`), so the bullet's
"REPL-only" premise was stale for the API path. The genuine,
concrete P0↔P1 seam gap: the inbound-channel agent run (goal 377)
set **no `metadata.userId`**, so `readUserId` returned undefined
and the hook no-opped — channel conversations never grew the user
model ("a channel chat is hollow if it doesn't know you").

Fix: `apps/api/src/server.ts` inbound runner now sets
`metadata: { userId: \`${providerId}:${source}\` }` (the channel
identity is that chat's user-memory scope, consistent with the
goal-377 thread-store keying). Integration test
`packages/agent-core/test/auto-extract-tool-turn.test.ts` composes
the real hook + an LLM-shaped extractor + JSON extraction +
sanitisation + `InMemoryUserMemoryStore` on a tool-using-turn
context: with the channel userId a fact is stored; **without a
userId nothing is stored** — pinning exactly the gap the channel
userId closes.

## Decisions

- Auto-extract is `afterComplete` and tool-agnostic — wiring it as
  a runtime hook is precisely what fixes the old REPL "skip
  extraction when tools enabled" behaviour; the integration drives
  the hook the way the runtime does, on a tool-using-turn context
  (a full bespoke tool-loop runtime would be gold-plating and
  verifies nothing extra about the hook).
- The LLM round-trip / `agentRuntime.run` message shape is
  unchanged (only `metadata.userId` added); auto-extract's extra
  `generate` is the existing wired hook behaviour, now reachable
  for channel runs. P0-b1's mandated check is "integration" — the
  green agent-core test — so re-running full smoke:live is not the
  proportionate gate.
