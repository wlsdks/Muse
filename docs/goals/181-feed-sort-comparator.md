# 181 — consistent feed-entry sort comparator

## Why

`muse feeds today` flattens every feed's recent entries and
re-sorts the merged list with an **inline** comparator that
diverged from the (correct) one in
`feeds-store.filterRecentFeedEntries`:

```js
if (!Number.isFinite(ta)) return 1;   // a undated
if (!Number.isFinite(tb)) return -1;  // b undated
return tb - ta;
```

For two undated entries `compare(a,b) === 1` **and**
`compare(b,a) === 1` — a non-antisymmetric comparator. V8's
`Array.prototype.sort` then orders the undated tail
arbitrarily / unstably, so the ambient world-state list could
shuffle between runs. The `feeds-store` version guards
both-undated → `0`; the `today` copy omitted it. Classic
copy-that-drifted bug.

## Scope

- `apps/cli/src/feeds-store.ts`:
  - Extract the correct order as exported
    `compareFeedEntriesNewestFirst(a, b)` (newest-first; dated
    before undated; two undated → 0). `filterRecentFeedEntries`
    now `.sort(compareFeedEntriesNewestFirst)`.
- `apps/cli/src/commands-feeds.ts`:
  - `muse feeds today` merged sort uses the same shared
    comparator (deletes the buggy inline copy). Single-sourced
    so the per-feed and merged sorts can't drift again
    (rule-of-two extract — the divergence *was* the bug).
- `apps/cli/test/program.test.ts`: new case asserting the
  total-order properties incl. the both-undated → 0 fix and a
  deterministic `Array.sort`.

## Verify

- `pnpm --filter @muse/cli test` — 464 pass (1 new; the
  existing `filterRecentFeedEntries cutoff` test unaffected —
  behaviour identical, just single-sourced).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Pure sort logic — no real-LLM path (smoke:live not required).

## Status

done — the ambient `muse feeds today` list now has a stable,
deterministic order even when feeds omit pubDate; one
comparator instead of two divergent copies.
