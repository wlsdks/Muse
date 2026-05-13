# Phase D — agent-initiated turn → chat-stream routing

Status: **design-only.** Audit finding #20.

## Why this needs a design pass

`proactive-notice-loop.ts:463-503` already invokes the LLM
(`modelProvider.generate()` / `agentRuntime.run()`) when a calendar
event or task is imminent AND the activity tracker shows recent chat
activity. The synthesized text exists. But the only sink today is the
messaging registry (Telegram / Discord / Slack / log), so a user with
an active REPL or web chat **never sees the proactive turn inline** —
the conversation it was meant to continue is the one place it doesn't
land.

The fix is not "loop calls /api/chat" — that would re-enter the model
and double-charge. It's "rebroadcast the existing synthesized message
to whoever is listening on this user's chat stream."

## Surface

1. **`AgentInitiatedNoticeBroker`** — small in-process pub/sub primitive
   in `packages/agent-core`. Producers call `broker.publish(userId,
   message)`. Consumers call `broker.subscribe(userId, onMessage)` and
   receive an unsubscribe function. Fail-soft: a slow consumer never
   blocks the publisher (drop-on-pressure with a counter).

2. **`apps/api/src/agent-notices-routes.ts`** — `GET /api/agent-notices/stream?userId=<id>`
   SSE endpoint. Each subscriber holds the connection open; the
   broker drives `event: agent_notice\ndata: {…}` lines. Closes
   cleanly on client disconnect.

3. **proactive-notice-loop wiring** — when Phase D synthesizes a
   response, ALSO call `broker.publish(userId, { kind, text,
   sourceId, generatedAt })`. The existing messaging-sink path stays
   unchanged so users without an active chat session still get the
   Telegram/etc nudge.

4. **CLI consumer** — `muse listen --inline` (or new `muse agent-notices
   tail`) subscribes to the SSE stream and prints inbound notices
   between user prompts in the REPL.

5. **Presence signal** — the existing `lastActivityMs` tracker stays
   the gate for whether Phase D runs at all. The new broker fans out
   to anyone listening even if no presence — that's correct: a user
   who started listening *just now* should get the next notice too.

## Why not extend reminder firing

Reminder firing is fire-once: the daemon flips `pending → fired` and
the reminder is gone. Agent-initiated notices are different — they
have no `status` to flip and can fire repeatedly across the day
(e.g. the proactive loop firing a "meeting in 10 min" every minute
until the meeting starts). The reminder firing daemon's dedupe via
`fired-history.jsonl` is wrong shape; the broker drops in-flight
without persistence by design.

## Implementation order (4 iters)

1. **Broker primitive** — `AgentInitiatedNoticeBroker` interface +
   `InMemoryAgentInitiatedNoticeBroker` impl in `@muse/agent-core`.
   Direct unit test covering publish / subscribe / unsubscribe /
   drop-on-pressure / multi-subscriber fan-out.

2. **API route + autoconfigure plumbing** — register
   `GET /api/agent-notices/stream` on the Fastify server, fed by
   the broker. Smoke test covering connect → publish → receive →
   disconnect.

3. **Proactive loop publisher** — modify `runDueProactiveNotices`
   to also call `broker.publish` when synthesis runs. Existing
   tests assert messaging sink; add a new assertion that the
   broker also got the call.

4. **CLI subscriber** — `muse listen --inline` SSE consumer that
   prints inbound notices between user prompts. Fail-soft on
   connection loss with a one-line reconnect message.

## Out of scope (for now)

- Persistent buffering of notices for clients that come online
  later (separate iter — needs a TTL'd backing store).
- Cross-device fan-out (the broker is single-process).
- Filtering notices by chat-channel (today every user's broker
  channel is global).
