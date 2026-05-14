# 097 — `MUSE_PERSONA` env fallback for every persona-aware subcommand

## Why

`muse chat` honoured `MUSE_PERSONA` (chat REPL already fell back
to the env var when `--persona` was unset). The other six
persona-aware subcommands — `brief`, `remember`, `ask`, `trust`,
`approval`, `job run` — did not. A user who set
`export MUSE_PERSONA=work` in their shell-rc still had to repeat
`--persona work` on every invocation. P1 from
`docs/agent-capability-audit.md` ("Per-shell persona auto-load").

The split was accidental: each subcommand had its own
`defaultUserKey` / `composeKey` helper that read `MUSE_USER_ID` /
`USER` for the user id but never looked at `MUSE_PERSONA`. The
chat REPL had the fallback inlined. Result: persona context drifted
across surfaces.

## Scope

- New `resolvePersona(option)` helper in
  `apps/cli/src/program-helpers.ts`. Precedence: explicit
  `--persona` > `MUSE_PERSONA` env > none. Trims whitespace,
  treats empty / whitespace-only env as unset.
- Every persona-aware command routes through the helper:
  - `chat-repl.ts` (chat REPL — was the only consumer doing it)
  - `commands-brief.ts` (`defaultUserKey`)
  - `commands-remember.ts` (`composeKey`)
  - `commands-ask.ts` (`defaultUserKey`)
  - `commands-approval.ts` (`defaultUserKey`)
  - `commands-trust.ts` (`defaultUserKey`)
  - `commands-jobs.ts` (forward resolved persona to the background
    worker via `--job-persona`)
- The in-session `/persona` slash command keeps working — it
  mutates `currentPersona` directly after the env-fallback resolution.

## Verify

- New `apps/cli/src/program-helpers-persona.test.ts` covers the
  seven precedence / trimming branches (option wins over env,
  empty option falls through, whitespace-only env is unset, …).
- `pnpm --filter @muse/cli test` — 275 tests pass.
- `pnpm check` — full build + every workspace test passes.
- `pnpm lint` — clean.

## Status

done — `MUSE_PERSONA=work muse brief|ask|remember|approval|trust|job run`
auto-applies the slot without `--persona`. Explicit `--persona`
still wins, matching the chat REPL's precedence.
