# 058 — muse notes search --mode llm-judge polish

## Why

The llm-judge mode exists but its system prompt + output validation
could be tighter. Survey + improve.

## Scope

- Read loopback-notes.ts llm-judge branch.
- Improve the prompt for better recall.
- Defense against model returning non-existent paths.

## Verify

- mcp +1 test.

## Status

done — two changes:

  1. **Tighter system prompt.** Explicit selection criteria
     (keyword + paraphrase + related context), explicit
     output-shape rules (single STRICT JSON array, no prose, no
     fences), explicit no-fabrication rule with example. Recall-
     over-precision guidance for ambiguous queries since the
     caller already caps `limit`.
  2. **Hallucination diagnostic surface.** When the model returns
     paths that don't exist in the candidate set, the result now
     carries `hallucinatedDropped: <n>` so callers can detect
     prompt drift without leaking the fabricated strings. Field
     is omitted when zero so the happy path stays minimal.

mcp +1 test for the positive case (diagnostic surfaces the right
count) plus a tightened existing test asserting the fabricated
string never round-trips into the result matches.
