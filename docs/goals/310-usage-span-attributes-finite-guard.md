# 310 — recordUsageSpanAttributes could stamp NaN/Infinity token counts

## Why

`recordUsageSpanAttributes` (`@muse/agent-core`) writes
`usage.input_tokens` / `output_tokens` / `reasoning_tokens` /
`cached_input_tokens` / `cache_hit_ratio` onto the model span —
the source of every token-cost / cache trace + OTel dashboard.
It gated each numeric attribute with `usage.<field> !==
undefined`, which **admits `NaN` / `Infinity`** (a malformed or
partially-parsed provider usage field). And the
`cache_hit_ratio` clamp `Math.max(0, Math.min(1, ratio))` does
**not** defend `NaN` (`Math.min(1, NaN)` → `NaN`,
`Math.max(0, NaN)` → `NaN`). A single non-finite usage value
then poisons the trace: any windowed average over a span
containing it is `NaN`, so token-cost and cache-hit dashboards
go blank/garbage exactly where an operator needs them. Same
telemetry-non-finite class the budget (280), retry-delay (284),
message-bus (289), and OTel-status (308) work closed at their
boundaries; the usage-attribute recorder was the untreated one.

## Scope

`packages/agent-core/src/runtime-helpers.ts` —
`recordUsageSpanAttributes`:

- A `stampFinite(key, value)` helper stamps the attribute only
  when `typeof value === "number" && Number.isFinite(value)`,
  applied to all four token attributes.
- `cache_hit_ratio` is computed only when **both**
  `cachedInputTokens` and `inputTokens` are finite numbers and
  `inputTokens > 0` (the existing `> 0` div-by-zero guard kept;
  the finite checks added), so a NaN/Infinity input can no
  longer produce a NaN ratio. One short WHY comment records the
  non-finite-poisoning rationale.

Behaviour-preserving for every real adapter today (Ollama /
OpenAI / Anthropic / Gemini emit finite or absent usage):
finite values are stamped exactly as before; only non-finite /
non-number values — previously poisoning the span — are now
skipped.

## Verify

- `pnpm --filter @muse/agent-core test` — 539 pass (was 537;
  +2). New regressions: a usage block with `inputTokens: NaN`,
  `outputTokens: Infinity`, `cachedInputTokens: NaN`,
  `reasoningTokens: 9` stamps **only** `usage.reasoning_tokens=9`
  (no NaN/Infinity attrs, no derived NaN `cache_hit_ratio`); a
  valid `{cachedInputTokens:40, inputTokens:100}` still stamps
  `cached_input_tokens=40` and `cache_hit_ratio=0.4`. The
  existing stamps-every-field / only-populated-fields /
  no-usage-block tests stay green.
- `pnpm check` — every workspace green (agent-core 539,
  apps/cli 563, apps/api 161, all packages). `pnpm lint` —
  exit 0.
- No real-LLM request/response path touched (telemetry
  span-attribute recording). A live Qwen run cannot make a real
  adapter emit a NaN usage field on demand, so the deterministic
  fake-span regression is the rigorous verification — same
  stance as the telemetry goals 280 / 284 / 289 / 308.

## Status

done — the usage span recorder now skips non-finite token
counts and never derives a NaN `cache_hit_ratio`, so a malformed
provider usage field can no longer poison token-cost / cache
trace dashboards. Finite usage from every real adapter is
recorded unchanged.
