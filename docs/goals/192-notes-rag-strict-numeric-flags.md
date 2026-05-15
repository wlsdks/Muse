# 192 — `muse notes semantic` / `reindex` strict numeric flags

## Why

The strict-numeric line (177 pattern, 178 ask, 179 recall,
184 jobs, 188 notes-search) replaced silent default-fallback
flag parsing with explicit rejection so a typo surfaces
instead of changing behavior invisibly. Two flags on the core
RAG surface still had the old anti-pattern:

- `muse notes semantic --top`:
  `Math.max(1, Math.min(50, Number.parseInt(options.top, 10) || DEFAULT_TOP_K))`
- `muse notes reindex --chunk-chars`:
  `Math.max(120, Number.parseInt(options.chunkChars, 10) || DEFAULT_CHUNK_CHARS)`

Two concrete bugs:

1. **Silent default on garbage.** `--top abc`, `--top 0`,
   `--top -3` → `NaN/0 || 5` → silently 5 results. A user who
   typos `--top 1O` (letter O) gets a wrong-sized result set
   and may draw wrong conclusions about corpus coverage — with
   no signal anything went wrong. RAG retrieval is a core
   JARVIS path; a silently-wrong top-K is a silently-wrong
   answer.
2. **`parseInt` trailing-garbage leniency.** `parseInt("600x")`
   is `600` — a unit-slip like `--chunk-chars 600x` silently
   "works". The whole strict line uses `Number()` precisely so
   that rejects.

`--chunk-chars` also silently clamped a below-floor value up
to 120 (asking for 50 quietly got you 120) and had **no upper
bound**, so `--chunk-chars 999999999` would feed an absurd
chunk to the embedder.

## Scope

- `apps/cli/src/commands-notes-rag.ts`: add an exported
  `parseRagBoundedInt(raw, flag, min, max, fallback)` that
  mirrors `commands-ask.ts`'s `parseBoundedInt` (goal 178) —
  absent → fallback; `Number()` (not `parseInt`); reject
  non-finite / below-min with
  `<flag> must be an integer in [min, max] (got 'x')`; truncate
  + clamp-to-max. Wire both call sites:
  `--top` → `[1, 50]`, `--chunk-chars` → `[120, 8000]`.
  Helper duplicated locally rather than imported across command
  modules — consistent with the per-command duplication the
  strict line + the 189–191 quarantine work already chose
  (small leaf helper, nothing to diverge, no cross-module
  coupling).
- `apps/cli/src/commands-notes-rag.test.ts`: direct unit
  coverage (fallback, truncation, clamp-above-max, and
  rejection of `abc` / `1O` / `600x` / `0` / `-3` / below-min).

## Verify

- `pnpm --filter @muse/cli test` — 498 pass (4 new cases,
  src+dist).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM request/response path touched — flag parsing
  runs before any embed/model call; pure function. No
  smoke:live needed.

## Status

done — both numeric flags on the RAG surface now reject a
typo'd / unit-slipped / out-of-range value with an actionable
message instead of silently substituting a default, matching
the rest of the strict-numeric line. `--chunk-chars` also
gained a sane upper bound (8000) so an absurd value can't be
handed to the embedder.
