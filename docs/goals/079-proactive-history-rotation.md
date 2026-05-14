# 079 — Proactive-history.json rotation on size

## Why

Rotates ~/.muse/proactive-history.json when it exceeds N entries
(default 1000). Keeps the file from growing without bound.

## Scope

- Read personal-proactive-history-store.ts.
- Add maxEntries with rotation to .1 / .2 / ...

## Verify

- mcp +2 tests.

## Status

done — `appendProactiveHistory` gains an `archiveMaxFiles`
option (default 0 = pre-079 trim-without-rotation behavior).
When set ≥ 1, an append that would push the live file at-or-
past `capacity` first rotates: existing `${file}.<n-1>` → `.n`
all the way up the ladder, current live file → `.1`, then a
fresh live file carries only the new entry. Slots beyond
`archiveMaxFiles` are unlinked so disk usage stays bounded.

New `rotateProactiveHistoryFiles(file, archiveMaxFiles)` is
exported separately so an operator script can rotate
manually (e.g. as part of a cron cleanup) without going
through `appendProactiveHistory`.

Scope discipline: the default cap stays 500 (clamped to
5_000); the goal text said 1000 but the existing constant
fits the personal-JARVIS scale. Operators can tune `capacity`
+ `archiveMaxFiles` independently.

mcp +2 tests:
  - rotation chain (a,b → .1; c,d → .1, [a,b] → .2; e in
    live; verify all three slots).
  - archiveMaxFiles=0 preserves pre-079 trim behavior — no
    `.1` file ever created; oldest entries silently sliced.
