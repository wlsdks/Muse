/**
 * `/api/proactive/*` routes — operator-side audit for the
 * proactive surfacing daemon. Mirror of `/api/reminders/history`.
 *
 * Endpoints:
 *   - GET /api/proactive/history?limit=N   newest-first audit log
 *
 * The route is only registered when a `proactiveHistoryFile` is
 * configured on the server (matches the reminder-history gate).
 * Default off so a fresh install doesn't expose an empty file.
 */

import { readProactiveHistory } from "@muse/mcp";
import type { FastifyInstance } from "fastify";

import { requireAuthenticated } from "./server-helpers.js";
import type { ServerOptions } from "./server.js";

interface ProactiveRoutesGate {
  readonly authService: ServerOptions["authService"];
  readonly proactiveHistoryFile: string;
}

export function registerProactiveRoutes(server: FastifyInstance, gate: ProactiveRoutesGate): void {
  server.get("/api/proactive/history", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }
    const query = (request.query as { readonly limit?: string } | undefined) ?? {};
    const limitRaw = query.limit ? Number(query.limit) : undefined;
    const limit = limitRaw !== undefined && Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(500, Math.trunc(limitRaw)))
      : undefined;
    const entries = await readProactiveHistory(gate.proactiveHistoryFile, limit);
    return { entries, total: entries.length };
  });
}
