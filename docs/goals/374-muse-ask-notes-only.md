# 374 — `muse ask --notes-only`

Category: feature

(Carried forward from the pre-reset backlog as genuine, unbuilt
user-visible work — not a cosmetic edge-case.)

## Why

`muse ask --with-tools` enables web search. For a privacy /
local-only run the user wants RAG-grounded answers from notes
alone, no live network tools — but still the full agent runtime
and notes-RAG embedding path.

## Scope

- New `--notes-only` flag in `commands-ask.ts`.
- When set: disable `web_search` in the run metadata and filter
  the tool registry to notes + memory tools only.
- Mutually exclusive with (or implies) `--with-tools`.

## Verify

- `pnpm check` / `pnpm lint` (0/0) / `pnpm smoke:broad`.
- `pnpm smoke:live`: with `--notes-only`, assert the model never
  invokes `muse.search` (assert the negative directly — no
  fall-back assertion).
- +1 CLI parser test.

## Status

open
