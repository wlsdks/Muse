# 054 — muse today --summarize (revive 013, scoped narrower)

## Why

Pipe today's briefing through the LLM for a 2-3 sentence narrative.
Save flag --to-notes <path> for journal entries.

## Scope

- --summarize flag on muse today.
- Calls agentRuntime.run with TODAY_BRIEF_SYSTEM_PROMPT.
- --save-to-notes persists the narrative.

## Verify

- cli + smoke:live.

## Status

done — observation up front: `muse today --brief` already pipes
the briefing through the LLM with `TODAY_BRIEF_SYSTEM_PROMPT`
and prints a 2-3 sentence narrative (shipped before this goal
was filed). The actually-new contribution is the
`--save-to-notes <path>` flag that persists that narrative as a
markdown file under `MUSE_NOTES_DIR` so a morning brief becomes
a journal entry without a second command.

Guard: `--save-to-notes` requires `--brief` (only the narrative
is saved; the structured briefing has its own surfaces). The
note layout mirrors `muse search --to-notes` — overwrite-by-id
under the user's configured notes directory, with a stderr
banner that surfaces the save while leaving stdout clean for
piped consumers.

cli +1 test asserts the `--save-to-notes` without `--brief`
guard fires with the right message and doesn't reach the API.
