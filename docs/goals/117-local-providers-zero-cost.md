# 117 — `estimateCostUsd` returns $0 for local providers

## Why

`estimateCostUsd(model, in, out)` fell through to `defaultPricing
= [$0.001/1k input, $0.002/1k output]` whenever the model name
didn't match a known cloud pricing entry. A user running
`ollama/qwen3.5:9b-q4_K_M` accumulated phantom dollars on every
turn:

- `muse status` token-cost rollup (goal 078) credited fake spend
  to a Qwen day.
- `muse metrics show` budget panel + `MonthlyBudgetTracker`
  ticked toward `warning` / `exceeded` on free local inference.
- `InMemoryCacheMetricsRecorder.estimatedCostSavedUsd` similarly
  manufactured "savings" that never existed.

Local inference is $0/token by construction. The cost meter
should reflect that — otherwise a user can't trust the dashboard
to tell them how much cloud spend they actually have.

## Scope

- `packages/cache/src/index.ts`:
  - New `LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"])` —
    the two local-runtime provider ids Muse ships adapters for.
    OpenAI-compatible endpoints with a local base URL still
    cost-track because Muse can't reliably tell `localhost`
    from a managed OpenAI-compat endpoint without out-of-band
    config.
  - New exported `isLocalProvider(model)` — delegates to
    `resolveProvider` so explicit `ollama/<tag>` AND bare
    `qwen` / `llama` / `gemma` / `mistral` / `phi` / `starcoder`
    prefixes (all mapped to ollama via `knownModelPrefixes`)
    short-circuit consistently.
  - `estimateCostUsd` short-circuits to `0` when
    `isLocalProvider(model)` is true. The cloud-billing path is
    unchanged.

## Verify

- New `packages/cache/test/cache.test.ts` case pins:
  - Explicit `ollama/<tag>` → 0 (incl. huge token counts).
  - Explicit `lmstudio/<tag>` → 0.
  - Bare `qwen…` / `llama3.2` → 0 (via knownModelPrefixes).
  - `gpt-4o-mini` / `anthropic/claude-3-haiku` still bill.
  - `isLocalProvider` returns true/false in lock-step.
- `pnpm --filter @muse/cache test` — 13 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- `pnpm smoke:live` — 13/0 (cost-estimation is in the response
  post-processing path; live LLM round-trip unaffected).

## Status

done — the budget / token-cost surfaces no longer manufacture
phantom spend for users on local LLMs.
