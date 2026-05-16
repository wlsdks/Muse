# 284 — computeRetryDelay had no non-finite guard (NaN knob silently disabled backoff)

## Why

`computeRetryDelay` (`@muse/resilience`) feeds the retry loop's
`await sleep(computeRetryDelay(attempt, options))`. It resolved
every knob with `?? default`:

```ts
const initial    = Math.max(0, options.initialDelayMs ?? defaultRetryDelayMs);
const multiplier = Math.max(1, options.multiplier ?? defaultRetryMultiplier);
const maxDelay   = Math.max(initial, options.maxDelayMs ?? Number.MAX_SAFE_INTEGER);
const base       = Math.min(maxDelay, initial * multiplier ** Math.max(0, attempt - 1));
const jitterRatio= Math.max(0, Math.min(1, options.jitterRatio ?? 0));
```

`?? default` only substitutes `null` / `undefined` — it does
**not** catch `NaN` / `Infinity`. A misconfigured
`RetryPolicy` (e.g. an env-derived `Number("")` → `NaN`, or a
bad config value) makes `initial` / `multiplier` / `maxDelay` /
`jitterRatio` `NaN`, which poisons `base` → the function returns
`NaN`. The loop then calls `sleep(NaN)`, and `setTimeout` coerces
a non-finite delay to **0** — exponential backoff is **silently
disabled** and the retry loop hammers a failing provider as fast
as the event loop allows. That is the exact opposite of what a
resilience primitive must do, and the precise non-finite class
goal 263 already closed for `withTimeout` — `computeRetryDelay`
is its untreated sibling.

## Scope

`packages/resilience/src/index.ts` — `computeRetryDelay`:

- Resolve `initialDelayMs` / `multiplier` / `maxDelayMs` /
  `jitterRatio` through a `finiteOr(value, fallback)` helper
  (`Number.isFinite` else default) instead of `?? default`, so a
  `NaN` / `Infinity` knob falls back to its default rather than
  poisoning the computation.
- A non-finite `attempt` is treated as the first attempt.
- Final return is guarded so a misbehaving injected `random`
  can't leak a non-finite delay either (`Number.isFinite(jittered)
  ? jittered : base`).
- One short WHY comment records the `?? doesn't catch NaN`
  rationale (same posture as `withTimeout`).

Behaviour-preserving for every valid input: `finiteOr` returns a
finite number unchanged and falls back on `undefined` exactly as
`?? default` did; `attempt` is unchanged for all finite values
(the retry loop only ever passes integers); the jitter clamp math
is untouched.

## Verify

- `pnpm --filter @muse/resilience test` — 17 pass. New
  regression: `initialDelayMs` / `multiplier` / `maxDelayMs` /
  `jitterRatio` of `NaN`, and `initialDelayMs: Infinity`, each
  yield a finite `>= 0` delay (pre-fix: `NaN`); a `NaN` `attempt`
  is treated as attempt 1 (→ `100`); a `random` returning `NaN`
  still yields a finite delay; the existing
  `{initial:100,max:250,mult:2}` case still returns exactly
  `250`. The bounded-delay / injectable-RNG-jitter /
  hard-ceiling tests stay green (valid-input parity).
- `pnpm check` — every workspace green (resilience 17,
  apps/cli 561, apps/api 160, all packages). `pnpm lint` —
  exit 0.
- No real-LLM request/response path touched (pure deterministic
  backoff math). A live Qwen run cannot reproduce a NaN-poisoned
  retry delay, so the deterministic regression is the rigorous
  verification — same stance as goals 263 / 261 / 274–283.

## Status

done — `computeRetryDelay` now never returns a non-finite value,
so a misconfigured numeric knob can no longer silently collapse
exponential backoff into a 0 ms hot-retry loop against a failing
provider. Valid configurations are unchanged.
