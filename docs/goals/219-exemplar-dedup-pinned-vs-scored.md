# 219 — a pinned exemplar that also scores must not be rendered twice

## Why

`InMemoryExemplarRetriever.retrieveTopK` builds the few-shot
"Answer Quality Examples" block injected into the **system
prompt of every exemplar-using model request** (a JARVIS
answer-quality lever). It combined the relevance-`scored`
exemplars with the `pinnedIds`-resolved ones as:

```ts
return renderExemplarDocuments([...scored, ...pinned], this.headerPreamble);
```

with **no dedup between the two lists**. A pinned id can also
be a top scorer for the query — then the exact same exemplar
(same id/body) is rendered **twice** into the few-shot block:

- wasted context budget — a multi-line answer example
  duplicated, costly on a tight local-Qwen window;
- a degraded few-shot signal — a repeated example is a known
  anti-pattern that makes the model over-weight that one
  pattern.

The existing test named "…and deduplication" did **not**
actually exercise this: its pinned id (`exemplar-2`) was not a
top scorer for its query, so the two lists never overlapped —
the bug was uncovered and the name was misleading.

## Scope

- `packages/prompts/src/index.ts`: before rendering, dedup the
  combined `[...scored, ...pinned]` list by `document.id` via
  a `seen` Set, preserving order (scored/relevance order
  first; pins only fill gaps they aren't already in). Only the
  duplicate is removed — scoring, pinning, ordering, fallback,
  and the `scored.length===0 && pinned.length===0` fallback
  branch are all unchanged.
- `packages/prompts/test/prompts.test.ts`: new regression
  test that pins `exemplar-1` AND queries the text that scores
  `exemplar-1` highest (guaranteed overlap) and asserts
  `[Example 1 - Compare options]` appears **exactly once**.
  Without the fix it matches twice; the pre-existing
  non-overlap "deduplication" test still passes.

## Verify

- `pnpm --filter @muse/prompts test` — 23 pass (1 new
  overlap regression; existing 22 unchanged).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Deterministic prompt-shaping fix: the rendered exemplar
  string is asserted exactly by the unit test (authoritative
  per the testing rules). The model-invocation path itself is
  unchanged — a real-LLM round-trip adds nothing over
  inspecting the rendered prompt, so no smoke:live needed
  (consistent with the deterministic prompt/string goals
  208/209/212).

## Status

done — a pinned-and-scored exemplar is now emitted exactly
once; the few-shot block no longer wastes context or sends a
duplicated answer example to the model.
