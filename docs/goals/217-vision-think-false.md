# 217 — `muse vision` must suppress Qwen3 reasoning (`think: false`)

## Why

The goal 171 reasoning-suppression gap on the vision path.
`buildOllamaVisionBody` (`commands-vision.ts`) posted to
Ollama's native `/api/generate` with
`{ model, prompt, images, stream: false }` — **no
`think: false`**. The chat path (goal 171) kills Qwen3
chain-of-thought with `think: false` on `/api/chat`; the
vision path never got the same treatment.

A Qwen-only deployment (the hard constraint) naturally points
`MUSE_VISION_MODEL` at a Qwen-class vision model. Such a model
would emit chain-of-thought into Ollama's `response` field,
and `commands-vision.ts` prints `payload.response` verbatim
(no `<think>` strip on this path, unlike the chat path's
`stripLeadingThinkBlock`). Result: `muse vision image.png`
returns a reasoning-polluted description instead of a clean
2–3 sentence caption. `/api/generate` honours the `think`
parameter exactly like `/api/chat`; non-thinking vision
models ignore it (cost zero), same as the documented
native-adapter behaviour.

## Scope

- `apps/cli/src/commands-vision.ts`: add `think: false` to
  `buildOllamaVisionBody` — the source-level suppression that
  matches the goal-171 native-endpoint pattern. One field; no
  other behaviour change.
- `apps/cli/test/program.test.ts`: the existing
  `buildOllamaVisionBody` assertion used `toEqual` (exact
  shape) and encoded the old body without `think` — updated to
  include `think: false` (asserting the corrected shape, same
  as goal 177 updating a test that encoded pre-fix behaviour).

## Verify

- `pnpm --filter @muse/cli test` — 514 pass (the exact-shape
  assertion now includes `think: false`; no regression).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Verification scope (transparent, same stance as goals
  207/208/216): no Qwen *vision* model is pulled locally
  (only the text-only `qwen3:8b` / `qwen3.6:35b-a3b`), so the
  full `muse vision <image>` description path can't be
  dog-fooded. The suppression mechanism was confirmed on real
  Ollama instead: `/api/generate` with
  `{model:"qwen3:8b", …, think:false}` is accepted and returns
  a clean response (the `think` param is valid/honoured on the
  native generate endpoint — the same mechanism dog-fooded
  end-to-end on `/api/chat` this session in goals 165/171/216;
  `/api/generate` honours `think` identically per Ollama's
  documented behaviour). The fix is sound by construction:
  the goal-171 native-endpoint suppression applied to the
  analogous endpoint, empirically accepting the parameter.

## Status

done — `muse vision` now sends `think: false`, so a Qwen3-class
vision model no longer dumps chain-of-thought into the image
description. Reasoning suppression is now consistent across
the chat (`/api/chat`) and vision (`/api/generate`) native
Ollama paths.
