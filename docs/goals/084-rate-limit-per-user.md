# 084 — Chat rate limiter keys on authenticated userId when present

## Why

Goal 031's `ChatRateLimiter` token-buckets per request IP. In a
multi-user deployment (or one behind a shared corporate egress
IP) that means a single noisy user starves everyone else. When
an authenticated identity is available on the request, key the
bucket on `userId` instead of IP; fall back to IP otherwise so
public / anonymous flows still get protection.

## Scope

- `clientKeyFromRequest` in `chat-rate-limiter.ts` becomes
  identity-aware: prefer `request.museIdentity?.userId`, fall
  back to `request.ip`.
- The chat-route gate plumbs the authenticated identity (already
  attached by `attachAuthIdentity` in the onRequest hook) into
  the limiter.
- Per-user + per-IP limits stay the same defaults (60/min) but
  the env var splits to
  `MUSE_RATE_LIMIT_CHAT_USER_PER_MINUTE` and
  `MUSE_RATE_LIMIT_CHAT_IP_PER_MINUTE` so an operator can tighten
  one without the other.

## Verify

- api +2 tests: two requests from the same IP but different
  authenticated users get independent buckets; an anonymous IP
  still consumes a bucket.

## Status

done — `clientKeyFromRequest` now prefers the authenticated
identity attached to the request by `attachAuthIdentity`
(set in the `onRequest` hook when a Bearer token validates).
Keys are namespaced — `user:<userId>` vs `ip:<addr>` — so the
two pools never accidentally collide; a user named "10.0.0.1"
still gets a separate bucket from the IP 10.0.0.1.

Net effect: two users behind a shared corporate egress IP each
get an independent 60-req/min bucket. Anonymous traffic still
limits per-IP, preserving the goal 031 hardening contract.

Scope deviation from the proposal: the env-var split into
`MUSE_RATE_LIMIT_CHAT_USER_PER_MINUTE` /
`MUSE_RATE_LIMIT_CHAT_IP_PER_MINUTE` is omitted — the keying
fix is the load-bearing anti-starvation change; per-prefix cap
tuning is operator sugar that can land as an additive follow-up
without breaking the existing `MUSE_RATE_LIMIT_CHAT_PER_MINUTE`.

api +2 tests:
  - `clientKeyFromRequest` covers authenticated (user-prefix),
    anonymous (ip-prefix), empty/missing inputs, and the
    namespace-collision guard.
  - end-to-end via the limiter: alice + bob both exhaust their
    own buckets independently; the anonymous IP bucket from the
    same source remains unaffected.
