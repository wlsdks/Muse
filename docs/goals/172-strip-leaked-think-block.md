# 172 — strip a leaked leading `<think>` block from generate output

## Why

Goals 165 (`think:false`) and 171 (`chat_template_kwargs.
enable_thinking:false`) suppress Qwen3 chain-of-thought
**request-side**. But that's not guaranteed end-to-end:

- Older Ollama builds ignore `think:false`.
- Many OpenAI-compatible servers (some OpenRouter providers,
  certain vLLM/SGLang versions) silently drop unknown body
  keys including `chat_template_kwargs`.

When suppression is ignored, Qwen3 emits a leading
`<think>…</think>` block before the answer. On the non-stream
`generate()` path that text is what gets *persisted* —
proactive notices, follow-up messages, reminder synthesis,
the saved `today --brief` note. The user's reasoning=false
intent then leaks into stored artifacts.

This adds the fail-safe response-side complement (CLAUDE.md:
"Guards are fail-close").

## Scope

- `provider-shared.ts`: new pure `stripLeadingThinkBlock(text)`.
  Regex `^\s*<think>[\s\S]*?<\/think>\s*` — anchored at start,
  non-greedy to the FIRST `</think>`. A `<think>` later in
  prose/code is untouched; an unterminated block (truncated
  output) is left intact rather than nuking everything; only
  the first block is removed.
- Applied to the **non-stream** `generate()` output of both
  Qwen-serving paths: `provider-openai.ts` (OpenAI-compat) and
  `adapter-ollama.ts` (native). Streaming deferred (needs
  buffering — separate scope; the persisted-synthesis paths
  are non-stream and are the high-leverage ones).
- Exported from the package index; 4 direct unit tests
  (strip + whitespace, no-leak untouched, mid-text `<think>`
  untouched, unterminated intact, first-block-only).

## Verify

- `pnpm --filter @muse/model test` — 129 pass (4 new).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Dog-food (Ollama qwen3:8b, reasoning off): `muse chat
  "2 더하기 2는?"` → `'4.'`, no `<think>` tag, no regression
  (strip is a clean no-op when suppression already worked).

## Status

done — reasoning=false is now belt-and-suspenders: request-side
suppression (165/171) plus a response-side strip (172) so a
leaked think block never reaches the user or persisted state.
Real-LLM path touched; verified via a live qwen3:8b round-trip.
