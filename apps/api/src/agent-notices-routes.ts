/**
 * `GET /api/agent-notices/stream?userId=<id>` — SSE consumer for
 * Phase D agent-initiated notices.
 *
 * Companion to the in-process `AgentInitiatedNoticeBroker` exposed
 * on the runtime assembly. Producers (the proactive-notice loop,
 * once it's wired in a follow-up commit) publish synthesised
 * one-line responses; this endpoint fans them out to whatever
 * client (CLI subscriber, web UI) is holding the SSE connection
 * open for the given `userId`.
 *
 * Lifecycle:
 *   1. Client GETs with `userId=<id>`.
 *   2. Route subscribes to the broker for that userId.
 *   3. Each publish yields `event: notice\ndata: <json>\n\n`.
 *   4. Client disconnect or HTTP close → unsubscribe (cleanup).
 *
 * Multiple clients for the same userId are independent subscribers —
 * each receives every notice (this is intentional; a user with two
 * surfaces open should see the notice in both).
 */

import type { AgentInitiatedNotice, AgentInitiatedNoticeBroker } from "@muse/agent-core";
import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";

import { requireAuthenticated } from "./server-helpers.js";
import type { ServerOptions } from "./server.js";

interface AgentNoticesRoutesGate {
  readonly authService: ServerOptions["authService"];
  readonly agentInitiatedNoticeBroker: AgentInitiatedNoticeBroker;
}

export function registerAgentNoticesRoutes(
  server: FastifyInstance,
  gate: AgentNoticesRoutesGate
): void {
  server.get("/api/agent-notices/stream", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }
    const query = request.query as { readonly userId?: string } | undefined;
    const userId = query?.userId?.trim();
    if (!userId) {
      return reply.status(400).send({
        code: "USER_ID_REQUIRED",
        message: "agent-notices/stream requires a `userId` query parameter"
      });
    }

    reply.header("content-type", "text/event-stream; charset=utf-8");
    reply.header("cache-control", "no-cache");
    reply.header("x-accel-buffering", "no");

    return reply.send(Readable.from(streamNoticesFor(gate.agentInitiatedNoticeBroker, userId, request.raw)));
  });
}

async function* streamNoticesFor(
  broker: AgentInitiatedNoticeBroker,
  userId: string,
  socket: { once(event: "close", listener: () => void): void }
): AsyncIterable<string> {
  const queue: AgentInitiatedNotice[] = [];
  let resolveNext: (() => void) | undefined;
  let closed = false;

  const onClose = () => {
    closed = true;
    resolveNext?.();
    resolveNext = undefined;
  };
  socket.once("close", onClose);

  const unsubscribe = broker.subscribe(userId, (notice) => {
    queue.push(notice);
    const resume = resolveNext;
    resolveNext = undefined;
    resume?.();
  });

  // Emit a one-shot `event: open` so clients can synchronise on the
  // subscription becoming live before the first publish. Without
  // this, a producer that fires immediately after the route opens
  // can race the consumer's listener registration.
  yield `event: open\ndata: ${JSON.stringify({ userId })}\n\n`;

  try {
    while (!closed) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => { resolveNext = resolve; });
        continue;
      }
      const next = queue.shift();
      if (!next) continue;
      yield `event: notice\ndata: ${JSON.stringify(next)}\n\n`;
    }
  } finally {
    unsubscribe();
  }
}
