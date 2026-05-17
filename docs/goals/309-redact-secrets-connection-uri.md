# 309 — redactSecretsInText missed connection URIs (off-device credential leak)

## Why

`redactSecretsInText` (`@muse/shared`, the `SECRET_PATTERNS`
scrubber) runs **pre-delivery on proactive notices** — its whole
point is that a credential which landed in a task title / notice
("rotate the db creds postgres://…") doesn't round-trip back out
via Telegram / Slack. Its patterns covered prefix-shaped tokens
(Anthropic / OpenAI / GitHub / AWS / Google / Slack / Stripe /
GitLab / JWT) but **not a `<scheme>://user:password@host`
connection URI**. So a Postgres / MySQL / Redis / Mongo / AMQP
URI with an inline password passed straight through the scrub
and was **sent off-device to a third-party messaging provider** —
the exact leak this function exists to prevent, and a more
dangerous path than the migration-log sibling (goal 307, which
stayed local).

## Scope

`packages/shared/src/index.ts` — `SECRET_PATTERNS`:

- Add a `connection-uri` pattern
  `\b<scheme>://[user]?:<password>@<rest>` (any scheme; user
  optional so password-only Redis URIs are caught), placed
  **first** so the whole credentialed URI is redacted as a
  single unit before a sub-pattern (e.g. a JWT-shaped password)
  can nibble it. A credential-free `https://host/path` lacks
  `:pass@` and is left intact. One short WHY comment records the
  redact-whole-unit + non-http-scheme rationale; mirrors the
  goal-307 migration-redaction rule.

Behaviour-preserving: every prior token shape and the
no-false-positive prose cases are unchanged; only credentialed
connection URIs — previously emitted in cleartext to outbound
channels — are now redacted as `[redacted-connection-uri]`.

## Verify

- `pnpm --filter @muse/shared test` — 10 pass (+1). New
  regression: `postgres://muse:notarealpw@…`,
  `redis://:authpw@…`, and `amqp://guest:guest@…` are redacted;
  a JWT-shaped password inside a URI is redacted as one
  `connection-uri` unit (connection rule runs before the `jwt`
  rule); a credential-free `https://docs.example.com/path` and
  prose `user@host` (no `://`) are left untouched. The existing
  Anthropic / OpenAI / GitHub-classic+fine / AWS / Google /
  Slack / Stripe / GitLab / JWT / no-false-positive tests stay
  green.
- `pnpm check` — every workspace green (shared 10, apps/cli 563,
  apps/api 161, all packages — every `@muse/shared` consumer
  passes, so no downstream over-redaction regression in the
  proactive-notice scrub path). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (deterministic
  secret-redaction regex). A live Qwen run cannot reproduce a
  connection-string-in-a-task-title on demand, so the
  deterministic regression is the rigorous verification — same
  stance as the redaction/security goals 307 / 278 / 294 / 298.

## Status

done — a DB/cache/broker connection URI with an inline password
in an outbound proactive notice is now redacted before it leaves
the device, closing an off-device credential leak in the
pre-delivery scrub. Every prior token shape and the
no-false-positive behaviour are unchanged.
