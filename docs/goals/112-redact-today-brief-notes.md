# 112 — `muse today --brief --save-to-notes` scrubs credentials before notes write

## Why

The goal-054 `--save-to-notes` flow persists the LLM-generated
"today" brief as a long-lived markdown note. Two attack surfaces:

1. The user has a task title or calendar event named
   `"rotate sk-proj-… tomorrow"`. The brief composer threads the
   title into the prompt; the LLM faithfully echoes the secret
   into the prose body.
2. The model itself hallucinates a credential-shaped string into
   the brief (rare but not zero).

Either way, the saved note carries the verbatim secret on disk —
and worse, the note dir often syncs to a third-party store
(iCloud / Obsidian Sync / Notion / git) where retention is
opaque.

## Scope

- `apps/cli/src/commands-today.ts`:
  - Import `redactSecretsInText` from `@muse/shared`.
  - In the `--save-to-notes` branch, wrap `prose.trim()` with the
    redactor before composing the markdown `body`.
  - The on-screen / `--speak` paths still see the original prose
    in this turn — only the persisted artefact is scrubbed, same
    trade-off as goal 109 (in-turn behaviour unchanged; future
    reads stay clean).

## Verify

- New `apps/cli/test/program.test.ts` case:
  - Mock `/api/today` + `/api/chat` so the brief response
    contains `sk-proj-…` AND `ghp_…` verbatim.
  - Run `muse today --brief --save-to-notes journal/today.md`
    against a temp `MUSE_NOTES_DIR`.
  - Assert: saved file contains `[redacted-openai-key]` +
    `[redacted-github-pat]` and NOT the verbatim shapes; the
    surrounding prose ("Reminder: rotate", "today") and the
    goal-054 `# Today brief —` heading survive.
- `pnpm --filter @muse/cli test` — 334 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched (the scrub is post-LLM disk hygiene;
  the live request still got the unredacted output, but the
  persisted artefact is clean).

## Status

done — the daily brief save path joins the goal-108 / 109 / 111
hygiene line. Every long-lived / outbound-bound user-text surface
now shares one redaction guarantee.
