# 287 — autoconfigure discarded OLLAMA_BASE_URL's value (remote host → silent localhost)

## Why

`createModelProvider` (`@muse/autoconfigure`) is the API/runtime
path that turns env into a `ModelProvider`. `OLLAMA_BASE_URL` —
the **conventional** Ollama env, the one the project's own
dog-food command exports, and the one the CLI's `resolveOllamaUrl`
(goal 259) honours — was used only as a *signal* to pick Ollama
as the default model (`inferDefaultModelFromCredentials`). Its
**value was then discarded**: the `case "ollama"` branch built
`new OllamaProvider({ baseUrl })` where `baseUrl` was
`parseOptionalString(env.MUSE_MODEL_BASE_URL)` *only*.

So a user who exports the natural
`OLLAMA_BASE_URL=http://my-host:11434` (a remote / non-default
Ollama) and `MUSE_MODEL=ollama/qwen3:8b` got an `OllamaProvider`
with `baseUrl: undefined`, which falls back to its hardcoded
`http://127.0.0.1:11434`. The provider then talks to **localhost**
instead of the configured host — a silent wrong target, a hard
"Ollama unreachable" with a confusing cause, and an inconsistency
with the CLI which *does* honour `OLLAMA_BASE_URL`.

## Scope

`packages/autoconfigure/src/autoconfigure-model-provider.ts` —
`createModelProvider` `case "ollama"`:

- `baseUrl: baseUrl ?? normalizeOllamaBaseUrl(env.OLLAMA_BASE_URL)`
  — the explicit Muse override (`MUSE_MODEL_BASE_URL`, surfaced as
  `baseUrl`) still wins; otherwise the conventional
  `OLLAMA_BASE_URL` is honoured.
- `normalizeOllamaBaseUrl`: `OllamaProvider` expects the
  OpenAI-compat `…/v1` base, but the conventional env (and the
  CLI's `resolveOllamaUrl`) is the bare host with no `/v1`. Trim
  trailing slashes and append a single `/v1` so either form
  works; `undefined` when unset so the provider keeps its own
  127.0.0.1 default. One short WHY comment records this.

Behaviour-preserving: unset `OLLAMA_BASE_URL` and unset
`MUSE_MODEL_BASE_URL` → still the provider's 127.0.0.1 default;
`MUSE_MODEL_BASE_URL` set → unchanged; only `OLLAMA_BASE_URL`'s
value is now actually used. Other providers untouched.

## Verify

- `pnpm --filter @muse/autoconfigure test` — 131 pass. New
  behavioural regression (stubs `globalThis.fetch` *before*
  construction — `OllamaProvider` binds it at construction):
  `OLLAMA_BASE_URL=http://remote.test:11434` (and the
  trailing-slash and already-`/v1` forms) routes the native
  request to `http://remote.test:11434/api/chat` (pre-fix:
  `http://127.0.0.1:11434/api/chat`); an explicit
  `MUSE_MODEL_BASE_URL` (with `MUSE_MODEL_PROVIDER_ID=ollama`)
  still wins; neither env set → `http://127.0.0.1:11434/api/chat`.
  The existing "autoconfigures Ollama when only OLLAMA_BASE_URL is
  set" test stays green.
- `pnpm check` — every workspace green (autoconfigure 131,
  apps/cli 561, apps/api 160, all packages). `pnpm lint` —
  exit 0.
- Real-LLM request/response path touched (which host the
  OllamaProvider is built for) → dog-fooded a real Qwen
  round-trip: `createModelProvider({ OLLAMA_BASE_URL:
  "http://127.0.0.1:11434", MUSE_MODEL: "ollama/qwen3:8b" })`
  → `provider.id === "ollama"`, `generate("Reply with exactly:
  PONG")` returned `"PONG"` in ~2.2 s with
  `usage {inputTokens:22, outputTokens:3}` against the live local
  Ollama (`GEMINI_API_KEY=""`, no paid model). The normalised
  base reaches real Ollama end-to-end.

## Status

done — autoconfigure now honours `OLLAMA_BASE_URL`, so a
remote/custom Ollama host configured the conventional way (and the
way this project's own dog-food and CLI do) is actually used
instead of silently falling back to localhost. Explicit
`MUSE_MODEL_BASE_URL` precedence and the no-env default are
unchanged.
