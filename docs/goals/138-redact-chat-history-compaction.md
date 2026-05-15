# 138 — `maybeCompactLastChatHistory` scrubs the LLM summary before write

## Why

The chat-history credential-hygiene chain so far:

- Goal 108 — `appendLastChatTurn` redacts each turn at write
  time, so the lines that feed into the compaction summariser
  are already clean.
- Goal 109 — `captureEndOfSessionEpisode` scrubs the episode
  summariser's output before persisting to `episodes.json`.

The chat-history *compaction* path (`maybeCompactLastChatHistory`)
was the missing link. The summariser is a model call; even with
goal-108-clean input, the LLM can hallucinate a credential-shaped
string into the summary, and the rewritten `last-chat.jsonl` then
carries that secret across every future `muse chat --continue`
turn until the file is compacted again or wiped. Cleaner JARVIS-
class persistence: scrub the summary too.

## Scope

- `apps/cli/src/chat-history.ts` `maybeCompactLastChatHistory`:
  - After the stream completes and `summary.trim()` lands, run
    the value through `redactSecretsInText` before composing the
    next-state lines AND before returning it to the caller.
  - `rawSummary` is the trimmed model output; `trimmedSummary`
    is the scrubbed form that hits disk + returns.

## Verify

- New `apps/cli/test/program.test.ts` case:
  - Seed `last-chat.jsonl` past `HISTORY_COMPACT_THRESHOLD` lines
    via repeated `appendLastChatTurn` calls.
  - Stub `modelProvider.stream` to emit a credential-bearing
    summary text.
  - Assert: the returned `summary` AND the on-disk
    `last-chat.jsonl` carry `[redacted-openai-key]`, NOT the
    verbatim secret; surrounding prose ("User asked about key
    rotation") survives.
- `pnpm --filter @muse/cli test` — 356 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched (scrub is post-summary disk hygiene;
  the live request still saw the unredacted output, but the
  persisted artifact is clean).

## Status

done — chat-history compaction joins the credential-hygiene line
of goals 086 / 107 / 108 / 109 / 111 / 112 / 116.
