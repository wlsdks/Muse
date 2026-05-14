# 023 — `muse search` 429 / rate-limit hint

## Why

When SearXNG returns 429 (or DuckDuckGo cooldown), the user sees a
generic "search failed" line. Add detection: if status is 429,
hint "rate-limited — back off for a minute, or self-host SearXNG
(see docs/setup-local-llm.md)".

## Scope

- Modify `loopback-search.ts`'s error path or the CLI-side display.
- Status 429 → structured `{ error: "rate-limited", hint: "..." }`.
- CLI renders the hint inline.

## Verify

- pnpm check / lint / smoke.
- mcp +1 test (synthetic 429 response).

## Status

done
 — DDG-fallback path's non-OK branch now special-cases 429 with
a structured response `{ error: "search backend rate-limited (429)
— back off for a minute, or self-host SearXNG ...", rateLimited:
true, status: 429 }`. Other non-OK statuses surface their numeric
code in the error message. CLI display unchanged (the `error`
field is already rendered).
