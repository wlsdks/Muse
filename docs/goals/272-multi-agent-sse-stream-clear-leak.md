# 272 — multi-agent SSE stream leaked the bus subscription on early disconnect (goal 271 sibling)

## Why

Direct sibling of goal 271, found by sweeping the same bug class
("a generator acquires a resource, then `yield`s **before** the
`try/finally` that releases it"). `toMultiAgentSseStream`
(`GET /api/multi-agent/stream`) did:

```ts
args.messageBus.subscribe("__sse__", (m) => { queue.push(m); … });  // resource acquired
yield `event: start\ndata: …\n\n`;                                  // <-- OUTSIDE the try
const runPromise = args.orchestrator.run(…).then(…);
try {
  while (…) { yield `event: agent_message…`; }
  …
} finally {
  args.messageBus.clear();                                          // cleanup only here
}
```

`messageBus.subscribe("__sse__", …)` registers a bus subscriber
before the `event: start` yield, which sits **outside** the
`try`. When an SSE consumer disconnects while the generator is
suspended at that first yield (quick reconnecting `EventSource`,
probe, dropped handshake), Node's `.return()` only runs `finally`
blocks enclosing the suspension point — line is not in the try —
so `messageBus.clear()` never ran. The `__sse__` subscriber and
its unbounded `queue` leaked per early-disconnected request.

## Scope

`apps/api/src/multi-agent-routes.ts`:

- Move the `event: start` yield to the **first statement inside
  the `try`**, so the `finally { messageBus.clear() }` covers
  every post-`subscribe` suspension point (early disconnect at
  start, mid-stream, or normal completion). `runPromise` is
  created before the `try` but contains no `yield`, so it cannot
  be a `.return()` suspension point — the only resource needing
  cleanup (the bus subscription) is now fully inside the
  try/finally.
- `toMultiAgentSseStream` is `export`ed for direct lifecycle test
  coverage (same convention as goal 271's `streamNoticesFor`).

`runPromise` now starts a tick before the `start` frame flushes;
harmless — the `subscribe()` (the race guard) still precedes it,
so queued agent messages are still delivered after `start`. No
framing or API change.

## Verify

- `pnpm --filter @muse/api test` — 160 pass (was 158; +2). New
  tests use a real `InMemoryAgentMessageBus` with a spied
  `clear()` and a real `MultiAgentOrchestrator`: pulling to the
  `event: start` frame then `.return()` (consumer disconnect at
  the handshake, worker hung so the loop is never reached) asserts
  `clear()` was called exactly once (pre-fix: 0 — the leak); a
  normal full drain also clears exactly once (no regression). All
  other api tests stay green.
- `pnpm check` — every workspace green (apps/api 160, apps/cli
  560, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (SSE
  subscription-lifecycle; synthetic `RuleBasedAgentWorker`s, no
  model round-trip). The leak is a generator-`.return()`-timing
  problem a live run can't trigger on demand, so the deterministic
  unit test is the rigorous verification — same stance as
  goal 271.

## Status

done — the multi-agent SSE stream now always clears its bus
subscription even when the consumer disconnects during the
`event: start` frame, closing the per-early-disconnect leak.
Both SSE streaming generators (`agent-notices` 271,
`multi-agent` 272) now release their broker/bus resources on
every exit path.
