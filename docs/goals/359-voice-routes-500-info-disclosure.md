# 359 — /api/voice/* leaked raw internal error messages to the network client on a 500

## Why

Diversified into the network-exposed API server (the server
half of JARVIS, less examined). `sendVoiceError` in
`apps/api/src/voice-routes.ts` mapped errors for the
`/api/voice/stt` + `/api/voice/tts` routes:

- `VoiceValidationError` → 400 with `error.message` —
  intentional, client-actionable, curated. Safe.
- `VoiceProviderError` → 502 with `error.message` — a typed
  class with a known/curated message. Acceptable.
- **else (any unexpected error) → 500 with raw
  `error.message` / `String(error)`** — the OWASP
  "information exposure through an error message" anti-pattern.

An *unexpected* throw on a network-reachable route — a Node
system error (`ECONNREFUSED 127.0.0.1:5432`), a thrown
`Error` carrying an internal filesystem path, a DB error
bubbling a connection URI with credentials, a TypeError
exposing internal structure — had its **raw message sent
verbatim to any HTTP client**. The codebase already uses the
safe generic-500 pattern elsewhere (`scheduler-routes.ts:266`
returns a generic localized message); voice-routes was the
inconsistent, leaky one.

## Scope

`apps/api/src/voice-routes.ts` — only the unknown-error 500
branch of `sendVoiceError`:

- Log the raw detail **server-side** via Fastify's
  `reply.log.error({ err: error }, …)` (observability
  preserved — pino structured, not lost), and return a
  **generic, non-leaking** body
  `{ code: "VOICE_INTERNAL_ERROR", error: "internal voice
  processing error" }` — same `{ code, error }` shape the
  typed branches use, no `error.message`.
- The `VoiceValidationError` (400) and `VoiceProviderError`
  (502) branches are **unchanged** — their messages are
  curated, client-safe, and intentionally actionable;
  narrowing the fix to the genuinely-unexpected 500 path is
  the correct threat-model scope.

Behaviour-preserving for every typed error; only the raw
internal leak on an unexpected 500 is removed. `reply.log` is
the idiomatic Fastify reply logger (no signature change, and a
no-op under `logger:false`).

## Verify

- `apps/api/test/server.voice.test.ts` — +1 case: a registered
  STT whose `transcribe` throws `new Error("ECONNREFUSED
  127.0.0.1:5432 /Users/internal/secret/path")` →
  `POST /api/voice/stt` returns **500**, body deep-equals
  `{ code:"VOICE_INTERNAL_ERROR", error:"internal voice
  processing error" }`, and the response body contains **neither**
  `ECONNREFUSED` **nor** the secret path. Existing
  stt/tts happy-path / 400 / 503 voice tests stay green.
- `pnpm --filter @muse/api test` — 162 pass (+1). `pnpm check`
  — every workspace green (apps/api 162, apps/cli 611, all
  packages). `pnpm lint` — exit 0. The goal-227 enforcement
  test (328) stays green.
- No real-LLM request/response path touched (HTTP error
  serialization). The deterministic route-injection test is
  the rigorous verification.

## Status

done — `/api/voice/*` no longer echoes a raw internal error
message to the network client on an unexpected 500; the detail
is logged server-side and the client gets a generic
`VOICE_INTERNAL_ERROR`. The actionable typed
(validation / provider) errors are unchanged, matching the
safe generic-500 pattern the rest of the API already uses.
