# 246 — `/api/messaging/inbox` only rejected NaN, not bad bounds

## Why

The strict-numeric sweep (224-237) hardened `apps/cli` flags but
not the API server's user-facing query params. `/api/reminders/
history` already set the codebase convention for a `?limit=`
param:

```ts
const limit = limitRaw !== undefined && Number.isFinite(limitRaw)
  ? Math.max(1, Math.min(500, Math.trunc(limitRaw)))
  : undefined;
```

`/api/messaging/inbox` diverged — it only filtered NaN:

```ts
const limitNum = query.limit ? Number(query.limit) : undefined;
if (limitNum !== undefined && Number.isFinite(limitNum)) {
  opts.limit = limitNum;   // -5, 0, 5.9, 1e9 all pass straight through
}
```

So `?limit=-5`, `?limit=0`, `?limit=5.9`, `?limit=999999` were all
forwarded verbatim to `registry.fetchInbound(providerId, opts)`.
The file-backed providers re-clamp internally (`readInbox` →
`clampReadLimit`), but the **live-API** providers (Telegram
`getUpdates`, Discord / Slack per-channel REST) receive
`options.limit` and may forward it to the external API or use it
in slicing without re-clamping — a negative / float / unbounded
value there means a provider 400 or an unbounded fetch. The HTTP
boundary is the right place to normalise, and it should match its
sibling route.

## Scope

- `packages/messaging/src/inbox-store.ts`: `MAX_READ_LIMIT` (200)
  was module-private; `export` it so the route and the store's own
  `clampReadLimit` share **one** cap constant (they can't drift).
- `packages/messaging/src/index.ts`: re-export `MAX_READ_LIMIT`.
- `apps/api/src/messaging-routes.ts`: clamp at the boundary —
  `Math.max(1, Math.min(MAX_READ_LIMIT, Math.trunc(limitNum)))` —
  the same shape `/api/reminders/history` and `clampReadLimit`
  use. NaN still drops to "no limit" (unchanged). One expression
  changed; no behavior change for a valid in-range integer.

## Verify

- `pnpm --filter @muse/messaging test` — 119 pass.
- `pnpm check` — every workspace green (messaging 119, apps/api
  155 (+2), apps/cli 555, all packages). Two new
  `server.messaging-poll.test.ts` cases register a capturing
  provider and assert the `limit` it actually receives:
  `-5 → 1`, `0 → 1`, `5.9 → 5`, `99999 → MAX_READ_LIMIT`,
  `50 → 50`, and `abc → undefined` (NaN dropped, not forwarded).
  (A narrow `vitest`-only run first showed `NaN` because it
  resolved `@muse/messaging` to its un-rebuilt `dist`; `pnpm
  check` builds the workspace first and is green — the code was
  correct, the narrow run was stale-dist, not a bug.)
- `pnpm lint` — exit 0.
- No real-LLM request/response path touched (HTTP query-param
  normalisation only), so no Qwen round-trip applies.

## Status

done — `/api/messaging/inbox` now normalises `?limit` at the HTTP
boundary exactly like `/api/reminders/history` and the inbox
store, so a hostile / fat-fingered negative, zero, float, or
unbounded limit can no longer reach a live messaging provider raw.
The two `?limit=` routes and the store now share one cap constant.
