# 259 — `muse doctor` probed a different Ollama host than the runtime

## Why

`muse doctor` exists to tell the user the truth about whether the
runtime is healthy. Its Ollama reachability check used:

```ts
const ollama_base = env.OLLAMA_BASE_URL ?? "http://localhost:11434";
```

But the actual runtime — `resolveOllamaUrl()` (used by
`muse ask` notes-RAG, `muse notes index`, and mirrored by the
Ollama model adapter, default `http://127.0.0.1:11434/v1`) —
defaults to **`http://127.0.0.1:11434`**, plus it merges
`~/.muse/models.json` and strips trailing slashes.

`localhost` is not the same as `127.0.0.1`: on a host with IPv6,
`localhost` commonly resolves to `::1` first, while Ollama binds
IPv4 `127.0.0.1` by default. So `muse doctor` could
`fetch("http://localhost:11434/api/tags")`, get ECONNREFUSED on
`::1`, and report **`ollama: not reachable`** plus skip the
"ollama model pulled" and "ollama embed model" checks — a scary,
**false-negative** health report — while `muse ask` (resolving
`127.0.0.1`) works perfectly. A diagnostic that contradicts
reality is worse than no diagnostic. A trailing slash on a
configured URL also produced a `//api/tags` probe and a spurious
warn.

## Scope

`apps/cli/src/commands-doctor.ts`:

- Import `resolveOllamaUrl` from `./ollama-url.js` and use it for
  the doctor's Ollama base URL instead of the divergent
  hardcoded `localhost` default. Doctor now probes **exactly**
  what the runtime uses: same `127.0.0.1` default, same
  `models.json` merge, same trailing-slash normalisation.

One import + one line; no other doctor check, output shape, or
exit-code behaviour touched.

## Verify

- `pnpm --filter @muse/cli test` — 559 pass (unchanged; every
  existing `muse doctor` test and the directly-tested
  `resolveOllamaUrl` contract test stay green → no regression to
  the doctor flow).
- `pnpm check` — every workspace green (apps/cli 559, apps/api
  155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (the doctor probe is
  a `GET /api/tags` reachability fetch, not a model round-trip).
- Verification posture: this is a trivial, self-evident
  substitution of a divergent hardcoded default for the
  canonical, **already directly unit-tested** resolver
  (`resolveOllamaUrl`: default `127.0.0.1`, env override,
  `models.json` fallback, trailing-slash trim — program.test.ts).
  The doctor inherits that proven contract by construction.
  A new test would either duplicate the existing
  `resolveOllamaUrl` coverage or require mocking global `fetch`
  inside the shared 559-test program suite for negligible added
  signal — declined deliberately, same honest stance prior
  trivial-delegation goals used.

## Status

done — `muse doctor` now diagnoses the same Ollama endpoint the
runtime actually talks to, so it can no longer cry "ollama not
reachable" (and silently drop the model/embed checks) on an
IPv6-`localhost` host where `muse ask` is in fact working.
