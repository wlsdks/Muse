# 322 — the Ollama-native /api/chat path (the actual Qwen runtime) had the unguarded 200-but-non-JSON gap

## Why

Goals 320 / 321 closed the 200-OK-but-non-JSON `response.json()`
gap in `OpenAICompatibleProvider` and the three native paid
adapters. **The one path that goal 320 did *not* cover is the
one Qwen actually runs through**: `OllamaProvider` *overrides*
`generate` to call Ollama's **native** `/api/chat` API (not the
OpenAI-compat `/v1/chat/completions` base), so it never reaches
the goal-320 fix in `OpenACompatibleProvider.generate`. Its
happy path was:

```ts
if (!resp.ok) {
  throw await this.buildNativeError(request, resp, "/api/chat");
}
const json = await resp.json() as OllamaNativeChatResponse;
```

`buildNativeError` handles `!resp.ok` (with the
`ollama pull <model>` 404 hint). But the 200-OK happy path's
`resp.json()` is unguarded: a `200` whose body is **not JSON**
— a reverse proxy / captive portal in front of a remote Ollama,
a body truncated by a local Ollama under memory pressure or
restarting mid-request — throws a raw `SyntaxError` that escapes
`OllamaProvider.generate` **as a non-`ModelProviderError`**,
breaking the `ModelProviderError.retryable` contract
(architecture.md: "the source of truth"). The resilience layer
can't classify the failure and the user sees a cryptic
JSON-parser stack trace instead of a clean retryable provider
error — on the **default, zero-cost, primary** runtime path.

## Scope

`packages/model/src/adapter-ollama.ts` — native `generate`
happy path:

- Read the body as text, parse with the existing safe
  `parseJson` (`provider-shared.ts`; a valid native chat
  response is never the JSON value `undefined`, so `=== undefined`
  unambiguously means "not JSON").
- On non-JSON, throw a **retryable** `ModelProviderError`
  (`true`) with the body bounded by `truncateErrorBody` — the
  contract-correct classification for an unknown transport
  anomaly, identical to goals 320 / 321 and to this adapter's
  existing connection-level-rejection posture (`stream`'s catch
  → retryable `true`).
- Add `truncateErrorBody` (value import from `@muse/shared`)
  and `parseJson` (added to the existing `./provider-shared.js`
  import). One short WHY comment (the transport-anomaly /
  contract rationale is non-derivable).

Behaviour-preserving for every valid native response —
`parseJson(rawBody)` yields the identical object `resp.json()`
produced, so the `OllamaNativeChatResponse` mapping
(`json.message?.content`, tool_calls, eval_count usage) runs
exactly as before.

## Verify

- `pnpm --filter @muse/model test` — 150 pass (was 149; +1; 5
  pre-existing live-only skips). New regression: a `200` with a
  `text/html` captive-portal body (+5000 padding) on
  `/api/chat` → `OllamaProvider.generate` rejects with
  `{ name: "ModelProviderError", providerId: "ollama",
  retryable: true }`, message contains `"was not valid JSON"`,
  bounded `< 360` chars. The existing native-shape /
  model-not-found-hint (176) / num_ctx (165) / streaming /
  connection-level-retryable tests stay green (valid JSON is
  byte-identical).
- `pnpm check` — every workspace green (model 150, apps/cli
  563, apps/api 161, all packages). `pnpm lint` — exit 0.
- **Real-LLM round-trip dog-food** (the Qwen happy path *was*
  touched): built dist + a real **Ollama `qwen3:8b`** round-trip
  through the modified native `generate`
  (`OLLAMA_BASE_URL=http://127.0.0.1:11434`, `OllamaProvider`,
  `think:false` / reasoning off) returned a clean `"PONG"` with
  `model=qwen3:8b`, populated usage (`in 24 / out 3`), and no
  `<think>` block — the text+`parseJson` swap parses a real
  valid native Ollama response identically to `resp.json()`. No
  paid model, zero cost.

## Status

done — the Ollama-native `/api/chat` path now converts a
200-but-non-JSON body into a retryable `ModelProviderError`
instead of leaking a raw `SyntaxError`. The
wrap-upstream-surprises class is now closed across **every**
model request path including the one Qwen actually uses —
`OpenAICompatibleProvider` (320), the three native paid adapters
(321), and Ollama-native (322) — and the Qwen happy path is
verified unchanged against a real round-trip.
