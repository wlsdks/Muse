# 258 — `muse ask` silently re-embedded a custom-model index (goal-257 sibling)

## Why

Goal 257 fixed this exact class in `muse notes semantic`. The
same shape was present in `commands-ask.ts` — and `muse ask` is
the **primary** query path, so the blast radius is larger.

`muse ask` auto-stale-refreshes the notes index before grounding:

```ts
const embedModel = options.embedModel ?? "nomic-embed-text";
...
if (options.autoReindex !== false) {
  const stale = await isNotesIndexStale(notesDir, notesIndexPath());
  if (stale) {
    await reindexNotes({ dir: notesDir, indexPath: notesIndexPath(), model: embedModel });
  }
}
...
if (index.model !== embedModel) {           // explicit guard — correct
  io.stderr(`Index was built with embed model '${index.model}', not '${embedModel}'. …`);
  process.exitCode = 1; return;
}
```

`embedModel` defaults to `nomic-embed-text` when `--embed-model`
is omitted, and `reindexNotes` treats a model change as a **full**
re-embed. So editing one note and then running a plain
`muse ask "<q>"` silently destroyed a deliberately-chosen
custom-model index and rebuilt it with the default — exactly the
goal-257 footgun, on the most-used command. The explicit guard
below fires cleanly on the not-stale path but never got the
chance once the stale refresh had already rewritten the index.

`commands-recall.ts` was checked too: it only *warns* on a
model mismatch and never calls `reindexNotes`, so it is safe and
out of scope. `muse ask` was the only remaining sibling.

## Scope

`apps/cli/src/commands-ask.ts` — mirrors goal 257 exactly:

- Read the existing index's `model` once before the auto-stale
  block (best-effort; `undefined` when no index exists yet).
- Pass `existingIndexModel ?? embedModel` to `reindexNotes`, so a
  stale refresh preserves the index's own embedding model and
  only a brand-new index uses the requested/default model.
- The explicit `index.model !== embedModel` guard is unchanged —
  the mismatch is still surfaced with the same actionable
  message, now consistently whether or not a note was stale.

One model argument changed plus a one-line pre-read; no other
behaviour, the `reindexNotes` API, or the not-stale path touched.

## Verify

- `pnpm --filter @muse/cli test` — 559 pass (was 558; +1). New
  test plants a stale index built with `custom-embed-xl` + a
  freshly-written note, runs `muse ask budget --no-tasks
  --no-calendar --no-reminders` with no `--embed-model`, and
  asserts (a) the actionable "Index was built with embed model
  'custom-embed-xl' … --embed-model custom-embed-xl" message and
  (b) the on-disk `notes-index.json` model is **still**
  `custom-embed-xl` (not silently downgraded by the stale
  auto-reindex).
- `pnpm check` — every workspace green (apps/cli 559, apps/api
  155, all packages). `pnpm lint` — exit 0.
- No meaningful real-LLM round-trip: the change is
  index-model-preservation control flow, and the model-mismatch
  guard returns *before* any model provider/LLM call, so a Qwen
  round-trip would never reach the model path here. The
  deterministic command-level test (fictitious model, so it is
  Ollama-independent — `reindexNotes` tolerates the embed failure
  via its existing per-chunk catch) asserting the on-disk index
  model + guard message is the rigorous verification, the same
  stance goal 257 used.

## Status

done — both notes-recall query entry points (`muse notes
semantic` from goal 257 and now `muse ask`) preserve the index's
embedding model on a stale auto-reindex instead of silently
re-embedding the whole corpus with the default. The user's chosen
embed model is no longer destroyed by a routine question.
