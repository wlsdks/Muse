# 349 — generic connection-failure message for the OpenAI-compatible / local-server path

## Why

Error-UX consistency. The native Ollama path already gives an
actionable connection-failure message
(`adapter-ollama.ts:249`):

> `Ollama request to …/api/chat failed: <detail> — is Ollama
> running? (\`ollama serve\`)`

But the **OpenAI-compatible base** (`provider-base.ts`
`fetchOrThrow`) — the path used by **LM Studio, a custom local
llama.cpp / vLLM Qwen server, OpenRouter, and Ollama's own
`/v1` compat ops** — produced only:

> `OpenAI-compatible request to <baseUrl> failed: <detail>`

For the Qwen-only constraint, the realistic failure is "the
**local** OpenAI-compatible model server isn't started" — and a
bare `fetch failed` with no hint is a poor first-run / outage
experience, and inconsistent with the native-Ollama path.

## Scope

`packages/model/src/provider-base.ts` — `fetchOrThrow` catch
(connection-level rejection only):

- Append an actionable hint, parallel to the native-Ollama
  path. A **loopback** `baseUrl`
  (`localhost`/`127.0.0.1`/`0.0.0.0`/`[::1]`, optional port) →
  `" — is the local model server running at this address?"`;
  otherwise → `" — endpoint unreachable; check the URL and
  network"`. The underlying `<detail>` (ECONNREFUSED etc.) is
  still included; `retryable: true` is unchanged. One short
  WHY comment.

Catch-only, message-only: a successful fetch returns at the
`return await this.fetchImpl(...)` line and never enters this
block, so the request/response happy path is provably
untouched. Tightest possible — no behaviour change beyond the
thrown message text.

## Verify

- `pnpm --filter @muse/model test` — 154 pass (was 153; +1; 5
  pre-existing live-only skips). New test: a refused
  `127.0.0.1:1234` and `localhost:8080` baseUrl →
  message contains "is the local model server running" and
  preserves the underlying `fetch failed` detail; a refused
  `https://openrouter.example/...` → "endpoint unreachable" and
  **not** "local model server". The existing
  connection-level-retryable / non-JSON-200 / contract tests
  stay green (they assert `{ providerId, retryable: true }` via
  `toMatchObject`, message-agnostic — no regression).
- `pnpm check` — every workspace green (model 154, apps/cli
  595, apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- **Real-LLM round-trip dog-food**: built dist + a real
  `qwen3:8b` round-trip through **`OpenAICompatibleProvider`**
  (the exact `fetchOrThrow` edited) *and* the native
  `OllamaProvider` (`OLLAMA_BASE_URL=127.0.0.1:11434`,
  reasoning off). The native path returned a clean `"PONG"` —
  the success path is unaffected by the catch-only edit, as
  reasoned. (Observed, **out of scope, not introduced here**:
  the `OpenAICompatibleProvider` → Ollama `/v1` round-trip
  returns empty output because qwen3's reasoning is not
  disabled on the `/v1` compat path the way the native
  `OllamaProvider` hardcodes `think:false`. That is a
  pre-existing gap in a different code path — a candidate for a
  future goal — and is provably unrelated to this catch-only
  message change.)

## Status

done — a connection-level failure on the OpenAI-compatible /
local-server path now carries an actionable hint
("is the local model server running at this address?" for a
loopback endpoint) consistent with the native-Ollama path,
instead of a bare `fetch failed`. Behaviour is otherwise
unchanged; the success path is untouched and the native Qwen
round-trip is verified clean.
