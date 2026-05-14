# 082 — muse auth rotate-jwt — operator-driven JWT secret rotation

## Why

The auth service already supports a `previousJwtSecrets` grace
window so a rotated key doesn't invalidate every in-flight
session. There's no CLI surface to trigger the rotation though —
operators have to hand-edit env vars and restart the daemon.

## Scope

- New `muse auth rotate-jwt [--grace-hours N]` subcommand.
- Writes a fresh 32-byte hex secret to `~/.muse/auth.json`,
  pushes the old value into `previousJwtSecrets` with a
  `validUntil` timestamp = now + grace-hours (default 24).
- Reuses the existing `AuthService.rotateSecret` path if one
  exists; otherwise add it.
- Live server picks up the rotation via the auth-service's
  file-watch hook (already present for credentials reload).

## Verify

- cli +1 test on the rotation round-trip (old token still
  authenticates inside grace; rejected after the window).
- auth +1 test on `rotateSecret`'s `validUntil` arithmetic.

## Status

done — new file-backed rotation state + CLI surface:

  - `~/.muse/auth-secrets.json` (overridable via
    `MUSE_AUTH_SECRETS_FILE`) holds
    `{ current, rotatedAt, previous: [{ secret, rotatedAt, validUntil }] }`.
    Atomic write + 0o600 file mode.
  - `muse auth rotate-jwt [--grace-hours N] [--json]` generates a
    fresh 32-byte hex secret, promotes it to `current`, pushes
    the old `current` (or `MUSE_AUTH_JWT_SECRET` env on
    bootstrap) onto `previous` with
    `validUntil = now + graceHours`. Default 24h.
  - autoconfigure's `createAuthService` reads the file at boot;
    `current` overrides `MUSE_AUTH_JWT_SECRET`, non-expired
    `previous` entries flow in as `previousJwtSecrets` so the
    existing `JwtTokenProvider` grace-walk verifies them. Missing
    / malformed file falls through to env-only (the pre-082
    path).

Scope deviation: the proposal mentioned an "auth-service
file-watch hook" — no such hook exists in this repo today, so
the operator restarts the daemon after rotating. Live reload is
left as a follow-up; the file-state piece is the load-bearing
contract that future hot-reload work hangs off.

cli +2 tests: pure rotation function (bootstrap, rotate,
prune-expired-previous) + CLI command round-trip (first rotation
grace-windows the env-only secret; second rotation pushes round-
1's `current` onto `previous`).
