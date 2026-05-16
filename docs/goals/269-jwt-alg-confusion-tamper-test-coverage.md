# 269 — lock in the JWT auth boundary's anti-forgery invariants

## Why

`verifyJwt` (the `JwtTokenProvider` verification path, the
server's authentication boundary) is correctly hardened against
the classic JWT pitfalls:

- it recomputes the signature with **HMAC-SHA256 regardless of
  the header**, then rejects unless `parsedHeader.alg === "HS256"`
  (anti alg-confusion / `alg:none` / downgrade), and
- it constant-time-compares the signature with a prior
  length-check (anti timing / `timingSafeEqual` length-throw).

But the existing tests only covered the *positive* path plus
expired / malformed / wrong-secret / weak-secret. The two
**highest-value security invariants** had **zero** negative
coverage:

1. a token whose **payload was tampered** after signing (claims
   modified, original signature kept) must be rejected, and
2. a token with a **valid HMAC-SHA256 signature** but a header
   `alg` other than `HS256` must still be rejected — the explicit
   anti-alg-confusion branch.

A future refactor that dropped the `alg` check or weakened the
signature comparison would be a **silent authentication bypass**
with no failing test. testing.md mandates direct coverage of
security-critical exports; this closes that gap.

## Scope

`packages/auth/test/auth-hardening.test.ts` — two new cases in
the `JwtTokenProvider edge cases` describe (test-only; no source
change — `verifyJwt` is already correct, this pins it):

- **Tampered payload**: decode a real token's payload, change
  `sub` to `"attacker"`, re-encode, keep the original header +
  signature → `parseToken` must return `undefined`.
- **alg-confusion**: forge a header `{alg:"HS512",…}`, sign
  `header.payload` with a *real* HMAC-SHA256 over the same secret
  (so the signature genuinely verifies) → `parseToken` must still
  return `undefined`. Plus a sanity assertion that the identical
  payload + signature with a correct `HS256` header **does**
  verify (`sub === "user-1"`), proving the rejection is
  specifically the `alg` check and not a broken fixture.

## Verify

- `pnpm --filter @muse/auth test` — 32 pass (was 30; +2). Both
  new cases pass; the existing positive / expired / malformed /
  wrong-secret / weak-secret tests stay green.
- `pnpm check` — every workspace green (auth 32, apps/cli 560,
  apps/api 155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (test-only; pure JWT
  verification). The negative inputs are adversarial tokens a
  live run never produces, so a deterministic unit test is the
  only meaningful verification — exactly the kind of coverage
  testing.md requires for a security boundary.

Several adjacent areas were verified-and-not-touched this
iteration (hooks fail-open, `recordHookTrace` internally guarded,
response-cache read+write fail-open, `writeJwtRotationState`
0o600, `--grace-hours` validation, `verifyJwt` itself) — all
already correct; the genuine, high-leverage gap was the missing
negative test coverage of the auth boundary, fixed here.

## Status

done — the JWT auth boundary's two core anti-forgery guarantees
(payload integrity and no alg-confusion) are now locked in by
direct negative tests, so a regression that reintroduced a
classic JWT bypass would fail CI instead of silently shipping.
