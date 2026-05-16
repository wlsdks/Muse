# 257 — `muse notes semantic` silently re-embedded a custom-model index

## Why

`muse notes semantic` has an explicit, correct guard:

```ts
if (index.model !== options.model) {
  io.stderr(`Index built with model '${index.model}', search using '${options.model}'. Re-index or pass --model ${index.model}.`);
  process.exitCode = 1; return;
}
```

…so if you built the index with a custom embedding model and
search without `--model`, you get an actionable error. **Unless**
a note changed since the last index: the auto-stale refresh ran
*first* with the wrong model:

```ts
const stale = await isNotesIndexStale(notesDir, indexPath);
if (stale) {
  await reindexNotes({ dir: notesDir, indexPath, model: options.model });
}
```

`options.model` defaults to `nomic-embed-text` when `--model` is
omitted. `reindexNotes` treats a model change as a **full**
re-embed (it only reuses cached files when
`existing.model === options.model`). So editing a single note and
then running a plain `muse notes semantic <q>` **silently nuked
the user's entire custom-model index and rebuilt it with the
default** — destructive, and inconsistent with the explicit guard
that fires cleanly on the not-stale path. The user's chosen
embedding model (often a larger/better one they deliberately
picked) was discarded by a routine search.

## Scope

`apps/cli/src/commands-notes-rag.ts` — the `semantic` action:

- Load the existing index's model once before the auto-stale
  block and pass `existingIndexModel ?? options.model` to
  `reindexNotes`. A stale refresh now preserves the index's own
  embedding model (incremental, fast); only a brand-new index
  (none on disk) uses `options.model`.
- The explicit `index.model !== options.model` guard below is
  unchanged, so the mismatch is still surfaced with the same
  actionable message — now **consistently**, whether or not a
  note was stale, and without ever silently re-embedding.

One model argument changed plus a one-line pre-load; no other
behaviour, the `reindexNotes` API, or the not-stale path is
touched.

## Verify

- `pnpm --filter @muse/cli test` — 558 pass (was 557; +1). New
  test plants a stale index built with `custom-embed-xl` and a
  freshly-written note, runs `muse notes semantic budget` with no
  `--model`, and asserts (a) the actionable
  "Index built with model 'custom-embed-xl' … --model
  custom-embed-xl" message is shown and (b) the on-disk
  `notes-index.json` model is **still** `custom-embed-xl` — i.e.
  the stale auto-reindex no longer downgrades it to the default.
- `pnpm check` — every workspace green (apps/cli 558, apps/api
  155, all packages). `pnpm lint` — exit 0.
- No meaningful real-LLM round-trip: the change is
  index-model-preservation control flow, not the model
  request/response wire. The deterministic command-level test
  uses a fictitious model (so `embed` fails regardless of whether
  Ollama is up, and `reindexNotes` tolerates it per its existing
  per-chunk catch) and asserts the on-disk index model + the
  guard message — both deterministic. A Qwen round-trip would add
  no signal here; the unit test is the rigorous verification, the
  same stance used for the other deterministic-logic fixes.

## Status

done — a stale `muse notes semantic` refresh now preserves the
embedding model the index was built with instead of silently
re-embedding the whole corpus with the default, and the
model-mismatch warning is consistent whether or not a note
changed. The user's chosen embed model is never destroyed by a
routine search.
