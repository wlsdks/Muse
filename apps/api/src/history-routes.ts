/**
 * `GET /api/history` — unified activity feed for the web UI +
 * external clients. Mirrors the `muse history` CLI command and
 * the `muse.history.recent` MCP loopback tool. All three consume
 * the same `readActivityFeed` helper from `@muse/mcp/personal-
 * activity-feed.ts` so coverage stays identical across surfaces.
 *
 * Query params:
 *   - `kind` (optional) — `reminder | proactive | followup | pattern | episode`
 *   - `sinceIso` (optional) — drop entries older than this timestamp
 *   - `limit` (optional, default 20, cap 200)
 *
 * Auth: `requireAuthenticated` (same posture as `/api/today`).
 *
 * Goal 014.
 */

import {
  ACTIVITY_KINDS,
  readActivityFeed,
  type ActivityKind
} from "@muse/mcp";
import type { FastifyInstance } from "fastify";

import { requireAuthenticated } from "./server-helpers.js";
import type { ServerOptions } from "./server.js";

interface HistoryRoutesGate {
  readonly authService: ServerOptions["authService"];
  readonly reminderHistoryFile?: string;
  readonly proactiveHistoryFile?: string;
  readonly followupsFile?: string;
  readonly patternsFiredFile?: string;
  readonly episodesFile?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export function registerHistoryRoutes(server: FastifyInstance, gate: HistoryRoutesGate): void {
  server.get("/api/history", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }

    const query = (request.query as { kind?: string; sinceIso?: string; limit?: string } | undefined) ?? {};

    let kind: ActivityKind | undefined;
    if (typeof query.kind === "string" && query.kind.length > 0) {
      const normalized = query.kind.trim().toLowerCase();
      if (!ACTIVITY_KINDS.has(normalized as ActivityKind)) {
        return reply.status(400).send({
          error: `kind must be one of: ${[...ACTIVITY_KINDS].join(", ")} (got '${normalized}')`
        });
      }
      kind = normalized as ActivityKind;
    }

    let sinceMs: number | undefined;
    if (typeof query.sinceIso === "string" && query.sinceIso.length > 0) {
      const parsed = Date.parse(query.sinceIso);
      if (!Number.isFinite(parsed)) {
        return reply.status(400).send({
          error: `sinceIso must be a parseable ISO timestamp (got '${query.sinceIso}')`
        });
      }
      sinceMs = parsed;
    }

    let limit = DEFAULT_LIMIT;
    if (typeof query.limit === "string" && query.limit.length > 0) {
      const parsed = Number.parseInt(query.limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(MAX_LIMIT, parsed);
      }
    }

    const entries = await readActivityFeed({
      episodesFile: gate.episodesFile,
      followupsFile: gate.followupsFile,
      ...(kind ? { kind } : {}),
      limit,
      patternsFiredFile: gate.patternsFiredFile,
      proactiveHistoryFile: gate.proactiveHistoryFile,
      reminderHistoryFile: gate.reminderHistoryFile,
      ...(sinceMs !== undefined ? { sinceMs } : {})
    });

    return { entries, total: entries.length };
  });
}
