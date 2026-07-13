/**
 * `GET /api/setup/status` — server-side counterpart to
 * `muse setup --json`. Returns the same `SetupStatusSnapshot` shape
 * so the web "Setup" panel (next loop) can render the health-check
 * inline without spawning a subprocess.
 *
 * Both surfaces call `collectSetupStatusJson` from
 * `@muse/autoconfigure/setup-status` — single source of truth on
 * what counts as "ok" / "todo" / "info" per section.
 */

import { collectSetupStatusJson } from "@muse/autoconfigure";
import type { ResolvedIntegrationEnvironment } from "@muse/autoconfigure";
import type { FastifyInstance } from "fastify";

import { requireAuthenticated } from "./server-helpers.js";
import type { ServerOptions } from "./server.js";

interface SetupRoutesGate {
  readonly authService: ServerOptions["authService"];
  readonly integrationEnv: ResolvedIntegrationEnvironment;
}

export function registerSetupRoutes(server: FastifyInstance, gate: SetupRoutesGate): void {
  server.get("/api/setup/status", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }
    const snapshot = await collectSetupStatusJson({ integrationEnv: gate.integrationEnv });
    return reply.status(200).send(snapshot);
  });
}
