# 361 — clampPositive (env-numeric context-window guard) had zero coverage

## Why

This iteration probed the network-exposed chat surface and
verify-and-rejected it (`buildDefaultChatRateLimiter` is
already correctly non-finite env-guarded; chat is the
most-tested path). The clean, high-leverage, non-tautological
gap is in `@muse/autoconfigure`: `clampPositive`
(`provider-utils.ts`) had **zero** test references.

It is the canonical env→positive-int guard, used at 5+ sites
in `context-engineering-builders.ts` to resolve the env vars
that size **the context injected into every model request**:
`MUSE_ACTIVE_CONTEXT_CALENDAR_LIMIT`,
`MUSE_INBOX_INJECT_LIMIT` / `_TOTAL_LIMIT`,
`MUSE_EPISODIC_RECALL_TOPK` / `_MAX_FETCHED`. It is the
env-misconfig-reachable analog of goal-342's `finiteOr`: a
mis-set env var (`""`, `"abc"`, `"0"`, `"-5"`) returning a
poisoned value would silently drop calendar / inbox / episodic
context injection on the Qwen runtime — the same silent
context-degradation class as goals 338 / 342 — and
`clampPositive` is the boundary that prevents it. A
load-bearing guard with no direct test is a latent regression.

## Scope

Test-only. New `packages/autoconfigure/test/provider-utils.test.ts`
(imported directly from `../src/provider-utils.js`; not
barrel-exported — same approach as goals 341/351/357), 5 cases:

- `undefined` (unset env) → fallback;
- valid positive int, whitespace-trimmed (`" 7 "` → 7);
- non-positive (`"0"`, `"-5"`) → fallback;
- non-numeric / empty / whitespace (`"abc"`, `""`, `"   "`)
  → fallback (the env-misconfig guard);
- **base-10 `parseInt` semantics pinned** so a future "strict
  `Number()`" refactor is a conscious decision: `"12.9"`→12
  (truncate), `"12abc"`→12 (lenient prefix), `"1e3"`→**1**
  (not 1000 — parseInt stops at `e`), `"0x10"`→fallback (base
  10 → `"0"` → ≤0, not 16).

Every expected value — especially the four subtle parseInt
cases — was **empirically verified against `Number.parseInt`
before asserting** (the verify-don't-guess discipline). No
production code changed.

## Verify

- `pnpm --filter @muse/autoconfigure test` — 136 pass (+5; new
  file). The existing model-provider / autoconfigure /
  external-mcp / setup-status suites stay green.
- `pnpm check` — every workspace green (autoconfigure 136,
  apps/cli 611, apps/api 165, all packages). `pnpm lint` —
  exit 0. The goal-227 enforcement test (328) stays green; the
  test file self-scans clean.
- No real-LLM request/response path touched (deterministic
  env-string parsing). The deterministic suite, with the
  pre-write `parseInt` verification, is the rigorous
  verification.

## Status

done — the env-numeric context-window guard now has direct
coverage of its unset / valid / non-positive / misconfig /
parseInt-semantics branches, closing an implicit-only-coverage
gap on the boundary that protects Qwen-runtime context
injection from a mis-set env var. No behaviour changed.
