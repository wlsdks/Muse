# 080 — Activity log compaction (rotate old proactive-history)

## Why

Pairs with 079. Provide a CLI subcommand to compact old logs into a
gz archive under ~/.muse/archive/.

## Scope

- New muse maintenance compact subcommand.
- Optional --keep-days N.

## Verify

- cli +1 test.

## Status

done — new `muse maintenance compact [--keep-days N]
[--dry-run] [--json]` subcommand walks `~/.muse/` for numbered
archive sidecars produced by goal 079 (e.g.
`proactive-history.json.1`), gzips each via `node:zlib`'s
`createGzip` pipeline into `~/.muse/archive/<name>.<iso>.gz`,
then unlinks the source. Atomic per-file: gz writes to a
`.tmp` sibling and renames on success so a partial pipeline
never leaves both copies behind.

Filtering:
  - Suffix regex `<name>.json.<n>` — strict.
  - Allow-list of known stores (`proactive-history.json`,
    `reminder-history.json`) so a stray operator file doesn't
    get swept.
  - Optional `--keep-days N` — only archives older than N
    days are compacted; defaults to "all numbered archives".

Live files (no numeric suffix) are never touched.

cli +1 test exercises the pure `planActivityLogCompaction`
function: suffix filter, allow-list filter (random sidecar
ignored), live-file exclusion, and the keep-days cutoff
(no match → empty plan, backdated mtime → single match).
The gz pipeline itself runs through `node:zlib` and doesn't
need its own test — Node's standard library is the contract.
