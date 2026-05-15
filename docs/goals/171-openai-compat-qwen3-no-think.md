# 171 — suppress Qwen3 thinking on the OpenAI-compatible adapter

## Why

Goal 165-era work confirmed the native Ollama path kills
Qwen3 chain-of-thought with `think: false`. But the
**OpenAI-compatible** adapter (used for OpenRouter
`qwen/qwen3-*`, vLLM, SGLang, LM Studio, custom endpoints)
had **zero** reasoning suppression — it only *read*
`reasoning_tokens` from usage. So every Qwen3 chat over an
OpenAI-compatible backend emitted `<think>…</think>`,
violating the user's explicit, repeated "reasoning=false"
requirement on every non-Ollama Qwen path.

## Scope

- `packages/model/src/provider-openai.ts` `toOpenAIChatRequest`:
  - Resolve `modelId` once; when it matches `/qwen3/iu`, add
    `chat_template_kwargs: { enable_thinking: false }` to the
    body. This is the portable Qwen3 switch honoured by vLLM /
    SGLang / LM Studio / OpenRouter (server-side chat-template
    kwarg, not a prompt hack).
  - **Gated to qwen3 model ids** so a strict server (real
    OpenAI / Azure) never receives an unknown body key for
    non-Qwen models — it would 400.
- Used by `provider-base.ts` for both generate + stream, so
  both paths are covered. The native Ollama chat path is
  untouched (it uses its own body with `think:false`).
- `packages/model/test/model.test.ts`: new case asserts the
  key is present for `qwen3:8b` and `qwen/qwen3-30b-a3b`, and
  **absent** for `gpt-test` and `qwen2.5:7b` (no false
  positive, no strict-server 400).

## Verify

- `pnpm --filter @muse/model test` — 125 pass (1 new).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No live round-trip: the user's active path is native Ollama
  (unaffected); verifying the OpenAI-compat Qwen path needs an
  OpenRouter/vLLM key which isn't present. The new test pins
  the exact wire body (request contract), which is the
  substantive verification.

## Status

done — reasoning=false now holds for Qwen3 on **every**
surface: native Ollama (`think:false`) and OpenAI-compatible
(`chat_template_kwargs.enable_thinking:false`), with a tight
qwen3-only gate so non-Qwen models are unaffected.
