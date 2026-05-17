# 355 — the Ollama-native tool-call request contract (the agentic Qwen path) was untested

## Why

Tool-calling on the local Ollama qwen3 path is **the** core
agentic JARVIS capability under the Qwen-only constraint. This
iteration first **verified-and-rejected** several candidates by
empirical dog-food: `buildNativeChatBody`'s tool mapping is
correct (a real `qwen3:8b` round-trip returned a proper
`toolCalls:[{arguments:{city:"Paris"},id,name}]` with empty
output and no leaked chain-of-thought — `think:false` works).
So the runtime behaviour is sound.

But it is **regression-unprotected**. Coverage audit:

- The native **streaming** tool-call response parse *is* tested
  (`OllamaProvider streaming tool-call delivered in a done:false
  chunk`).
- The tool-schema-contract harness covers Gemini / Anthropic /
  OpenAI-compatible request shapes — **not Ollama-native**.
- **No test** asserts the non-streaming `generate()` native
  request body: that `buildNativeChatBody` emits Ollama's
  `tools:[{type:"function",function:{name,description,parameters}}]`
  shape, that `think:false` is sent (the qwen3 CoT-suppression
  flag — the entire point of the native override; trivially
  broken by an unrelated refactor and the failure mode is silent
  chain-of-thought leaking into every answer), and that the
  native `message.tool_calls` response maps to `result.toolCalls`.

A future `buildNativeChatBody` refactor could silently break
the Qwen agentic path with nothing to catch it.

## Scope

Test-only. `packages/model/test/model.test.ts` — new
`describe("OllamaProvider native tool-call request/response
contract")`, one mocked-fetch test that captures the `/api/chat`
request body and returns a native `message.tool_calls` response
(the exact shape the empirical dog-food produced):

- request asserts `stream === false`, **`think === false`**,
  and `tools` deep-equals the native
  `[{ type:"function", function:{ name, description,
  parameters: <inputSchema> } }]` shape;
- response asserts `result.toolCalls` deep-equals
  `[{ arguments:{city:"Paris"}, id:"call_x", name:"get_weather" }]`,
  `output === ""`, and `usage === { inputTokens:7,
  outputTokens:3 }` (the `prompt_eval_count`/`eval_count`
  mapping).

Every expected value was traced against
`buildNativeChatBody` / the adapter-ollama generate() mapping
before asserting (the discipline carried from prior
guessed-shape mistakes). No production code changed — this
locks the empirically-verified contract.

## Verify

- `pnpm --filter @muse/model test` — 159 pass (was 158; +1; 5
  pre-existing live-only skips). The existing streaming
  tool-call / num_ctx / model-not-found / non-JSON-200 Ollama
  suites stay green.
- `pnpm check` — every workspace green (model 159, apps/cli
  611, apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- Real-LLM round-trip *was* exercised this iteration as
  investigation: a live `qwen3:8b` Ollama tool-call round-trip
  returned the correct `toolCalls` (reasoning off) — confirming
  the contract the new deterministic test now pins.

## Status

done — the non-streaming Ollama-native tool-call
request/response contract (native `tools` shape + `think:false`
+ `message.tool_calls` → `result.toolCalls`) now has a direct
regression test, locking the agentic capability on the
Qwen-only runtime that was empirically correct but
previously regression-unprotected. No behaviour changed.
