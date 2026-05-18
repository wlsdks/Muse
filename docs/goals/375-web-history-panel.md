# 375 — Web UI history panel

Category: epic / feature

(Carried forward from the pre-reset backlog. Backend prerequisite
`GET /api/history` already shipped; only the UI surface is unbuilt.)

## Why

`apps/web/src/ui/personal-panels.tsx` has tasks / notes / reminders
/ calendar panels but no activity feed, despite `/api/history`
being live. A JARVIS-class operator surface should show the
activity stream.

## Slices

1. **HistoryPanel component** — `apps/web/src/ui/history-panel.tsx`,
   tanstack-query against `/api/history`, relative-time formatting,
   style-matched to `personal-panels.tsx`. +1 component render test.
2. **Kind-filter + limit controls** — dropdown + limit selector
   wired to the query params.
3. **Mount + e2e** — mount in `App.tsx` beside the other personal
   panels; Playwright e2e asserting seeded entries render.

## Verify

- Per slice: `pnpm check`, `pnpm lint` (0/0), `pnpm smoke:broad`.
- Web component test per slice; Playwright e2e on the final slice.
- Visual dogfood: `pnpm --filter @muse/web dev`.

## Status

open
