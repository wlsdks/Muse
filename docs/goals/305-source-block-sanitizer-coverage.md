# 305 — source-block sanitizer had only 3 tests for an every-response guard

## Why

`sanitizeSourceBlocks` (`@muse/policy`) runs on **every** model
response via `response-filters-verified-sources.ts` — it strips a
trailing "Sources:" / "References:" block that the model padded
with nothing useful (empty fallbacks like "none" / "n/a", or a
bare link list with no real citation evidence). Its test suite
was 3 cases: linked-removal, empty-fallback-removal, and one
narrative-keep. Several real, behaviour-defining paths through the
function were **unverified** — most importantly the
**over-removal guard** (real answer content that merely follows a
`Sources:`-looking line must NOT be truncated). A future
regression there would silently truncate legitimate user answers
— the highest-stakes failure mode for a response-cleanup guard —
with no test to catch it. testing.md: "Direct unit tests for
every export … no implicit-only coverage."

This iteration surveyed several mature modules
(`createDerivedAgentMetrics` → consumers already non-finite
guarded like goal 280; `source-block-sanitizer` heuristic →
sound; all CLI numeric options → already validated). With no
reachable defect, the highest-value concrete change is locking
the under-tested guard's behaviour.

## Scope

`packages/policy/test/source-block-sanitizer.test.ts` — +5
direct cases (no source change; behaviour was verified correct
against the built module first):

- inline empty fallback on the heading line (`Sources: none`) →
  removed.
- bare dangling heading at end-of-response (`…\n\nSources:`,
  truncated section) → removed.
- a real cited block followed by a trailing `References: none`
  → only the trailing fallback stripped, the real
  `Sources:\n- https://example.com/x` block **kept** (scan-from-
  end behaviour).
- **over-removal guard**: real content following a
  `Sources: see below` line → `removed: false`, content
  unchanged (a regression here silently truncates answers).
- `doi:` / `arxiv:` reference list → `linked_source_block`
  removed (evidence detection beyond bare `http`).

## Verify

- `pnpm --filter @muse/policy test` — 64 pass (was 59; +5). The
  existing linked / empty-fallback / narrative-keep cases stay
  green; the 5 new cases pin the previously-implicit behaviours.
- `pnpm check` — every workspace green (policy 64, apps/cli 563,
  apps/api 161, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched and no source
  change — this is pure deterministic test hardening; the tests
  are themselves the verification (each expectation was
  pre-checked against the built `sanitizeSourceBlocks`).

## Status

done — the every-response source-block sanitizer's
behaviour-defining paths (inline fallback, dangling heading,
keep-real-strip-trailing, the over-removal safety guard, doi/arxiv
evidence) are now directly pinned, so a future change that would
silently truncate a legitimate answer is caught by a failing
test. No behaviour change; coverage only.
