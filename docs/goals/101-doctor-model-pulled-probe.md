# 101 — `muse doctor --local` checks the configured Ollama model is actually pulled

## Why

Canonical first-run footgun: a user runs `muse setup model` once,
the config sticks at `ollama/qwen3.6:27b`, they later switch
machines (or wipe `~/.ollama`) and now every `muse ask` /
`muse chat` fails mid-stream with a confusing `404 model not found`.
The Ollama daemon was reachable and the env said the model existed,
so nothing in `muse doctor` flagged the gap before the user hit it.

JARVIS doesn't ambush you with mid-stream failures. He says
"sir, the suit's actuators haven't been re-fitted" before liftoff.

## Scope

- `apps/cli/src/commands-doctor.ts` runLocalDoctor:
  - Reuse the `/api/tags` response from the existing Ollama
    reachability probe — no new HTTP call.
  - When `MUSE_MODEL` (or `MUSE_DEFAULT_MODEL`) starts with
    `ollama/` AND Ollama is reachable, run a cross-check via the
    new pure helper `findOllamaModelTag(models, configuredTag)`.
  - Emit a new `ollama model` check:
    - `ok`: `<tag> pulled (6.6 GB)` — uses the entry's `size`
      formatted into GB / MB / kB.
    - `warn`: `<tag> NOT pulled — run \`ollama pull <tag>\``.
  - When Ollama is unreachable, the check stays silent so the
    user doesn't see a fake "model not pulled" line.
- `findOllamaModelTag` treats `<base>` and `<base>:latest` as the
  same identity (matches Ollama's implicit `:latest` tagging).
- Distinct quants (e.g. `qwen3.5:9b-q4_K_M` vs `qwen3.5:9b-q8_0`)
  remain distinct — no over-matching.

## Verify

- New `apps/cli/src/commands-doctor.test.ts` with 6 cases pinning
  the precedence + edge behaviour.
- `pnpm --filter @muse/cli test` — all CLI tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Dogfood: `MUSE_MODEL=ollama/qwen3.6:27b node apps/cli/dist/index.js doctor --local`
  emits the expected probe (silent when Ollama isn't running on
  the test host — verified locally).

## Status

done — the probe surfaces the gap on `doctor --local` runs.
No real-LLM path touched (we only read `/api/tags`, the same
endpoint the existing reachability probe already calls).
