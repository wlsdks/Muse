# 271 — agent-notices SSE stream leaked a broker subscription on early disconnect

## Why

`GET /api/agent-notices/stream` streams Phase-D agent-initiated
notices via `streamNoticesFor`, an async generator that
`broker.subscribe()`s the user and `unsubscribe()`s in a
`finally`:

```ts
const unsubscribe = broker.subscribe(userId, (n) => { queue.push(n); … });

yield `event: open\ndata: …\n\n`;   // <-- OUTSIDE the try

try {
  while (!closed) { … yield `event: notice…`; }
} finally {
  unsubscribe();
}
```

The one-shot `open` frame was yielded **before** the `try`. When
an SSE consumer disconnects while the generator is suspended at
that first yield — a quick page-navigation, a reconnecting
`EventSource`, a health-check / probe, a dropped connection
during the handshake — Node calls the generator's `.return()`.
JS semantics: `.return()` only runs `finally` blocks that
**enclose the suspension point**, and the `open` yield is not
inside the try. So `unsubscribe()` never ran: the broker kept the
dead subscriber forever and its callback kept pushing into an
unbounded `queue` that nobody drains. Under connection churn on a
long-lived server this accumulates leaked subscriptions and
memory.

## Scope

`apps/api/src/agent-notices-routes.ts`:

- Move the `event: open` yield **inside** the `try`, so the
  `finally { unsubscribe() }` covers every suspension point of
  the generator after `subscribe()` — early disconnect at the
  open frame, disconnect mid-stream, or normal completion all now
  unsubscribe.
- `streamNoticesFor` is `export`ed for direct test coverage of
  the lifecycle (same convention as other injected-deps helpers;
  it already takes broker + socket as parameters precisely for
  testability).

One yield relocated; no behaviour, framing, or API change for the
happy path (`JSON.stringify` payloads are still 264-safe — no raw
line terminators).

## Verify

- `pnpm --filter @muse/api test` — 158 pass (was 156; +2). New
  tests drive `streamNoticesFor` with a spy-broker: `.next()` to
  the open frame then `.return()` (consumer disconnect at the
  handshake) asserts `unsubscribe` was called exactly once
  (pre-fix: 0 — the leak); and a mid-stream disconnect also
  unsubscribes once (no regression). All other api route /
  SSE tests stay green.
- `pnpm check` — every workspace green (apps/api 158, apps/cli
  560, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (SSE
  subscription-lifecycle fix; the stream carries proactive
  notices, not a model round-trip). The leak is a
  generator-`.return()`-timing problem a live run can't trigger
  on demand, so the deterministic unit test is the rigorous
  verification.

## Status

done — the agent-notices stream now always unsubscribes from the
broker (and stops growing its queue) even when the consumer
disconnects during the initial `open` frame, closing a
per-early-disconnect subscription + memory leak on a long-lived
streaming endpoint.
