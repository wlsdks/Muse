# 370 — strip iter/round/goal provenance from packages/mcp comments

## Why

Continues the block/prose comment-marker backlog corrected in goal
369 (`.claude/rules/code-style.md` hard rule; the 2026-05-15 sweep
only matched `//`-line markers, leaving JSDoc/prose provenance in
~110 src files). Per the recorded method — one coherent high-read
core package per iteration — `packages/mcp` is the next slice and
the largest single cluster: **27 citations across 17 files**. It is
also among the most JARVIS-core packages (loopback MCP servers for
tasks / status / history / search / notes / relative-time, the
proactive-notice + session-lock loop, the personal stores), so the
"agents read this; markers burn context budget and lower
signal-to-noise" rationale applies strongly.

## Scope

27 provenance citations stripped across 17 mcp files (comment text
only — **zero** behaviour / signature / logic change):

- `index.ts`, `loopback-helpers.ts`, `loopback-history.ts`,
  `loopback-search.ts`, `loopback-status.ts`, `loopback-notes.ts`
  ×2, `loopback-relative-time.ts`, `loopback-tasks.ts`,
  `manager.ts` ×2, `messaging-retry.ts` ×3, `notes-providers.ts`
  ×2, `personal-followups-store.ts`,
  `personal-proactive-history-store.ts` ×2,
  `personal-status-summary.ts`, `tasks-providers-notion.ts`,
  `proactive-notice-loop.ts` ×5, `tasks-providers.ts`.

Method (same as 369): pure WHAT/history citation deleted outright
(`Goal 052 — payload of …` → `Payload of …`; `landed in rounds
152 + 153` / `carved out … rounds 152-153` removed). Where the
provenance framing wrapped a genuine non-derivable WHY, the WHY was
rewritten to stand alone — e.g. `loopback-status` keeps the
"misleading model: null for a wizard-only user who skipped the
shell export" rationale without `before iter 44`; `messaging-retry`
keeps the transient-vs-permanent retry rationale without the three
`goal NNN` lift references; `loopback-helpers` keeps the
"duplication → consolidate" reason without `rounds 82-118`.
`mcp/src/*` is now fully marker-free (case-insensitive scan of
`goal|round|iter|iters|iteration` + digits → none).

## Verify

- `pnpm --filter @muse/mcp test` — 363 pass, 5 suites (unchanged:
  comment-only).
- `pnpm check` — every workspace green (apps/cli 647 incl. the
  `test/` glob, apps/api 165, all packages).
- `pnpm lint` — exit 0.
- goal-227/328 byte scan clean on every touched mcp file.
- No real-LLM request/response path touched — comment text only.
  The unchanged full green suite is the rigorous verification that
  nothing but comments moved.

## Status

done — `packages/mcp/src` carries zero round/iter/goal provenance
markers; genuine WHY content preserved, history rot gone. mcp is
the second package (after agent-core, goal 369) fully cleaned of
the block/prose marker class. The `project-comment-sweep` memory is
updated to record this progress against the ~110-file backlog.
