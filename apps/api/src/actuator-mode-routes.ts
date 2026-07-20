/**
 * `/api/settings/actuators` — the actuator-mode selector the web console and
 * desktop app drive.
 *
 *   - GET  /api/settings/actuators   { mode }
 *   - PATCH /api/settings/actuators  { mode } — off | ask | auto
 *
 * State lives in `~/.config/muse/config.json`'s `actuators` block
 * (`@muse/autoconfigure`'s `readActuatorConfigSafe` / `writeActuatorConfig`) —
 * the SAME file `muse chat` reads per turn, so a change here takes effect on
 * the next chat turn with no restart. This route never talks to a running
 * process directly (identical shape to `/api/day-rhythm`).
 *
 * The reader is the SAFE variant: a corrupt config resolves to `off` rather
 * than 500-ing this endpoint. The writer is the strict one — a PATCH must
 * fail loudly on a bad request rather than silently store nothing.
 */

import {
  isActuatorMode,
  readActuatorConfigSafe,
  writeActuatorConfig,
  ACTUATOR_MODES,
  type ActuatorMode
} from "@muse/autoconfigure";
import type { FastifyInstance } from "fastify";

import { requireAuthenticated } from "./server-helpers.js";
import type { ServerOptions } from "./server.js";

export interface ActuatorModeRoutesGate {
  readonly authService?: ServerOptions["authService"];
  readonly configFile: string;
}

export interface ActuatorModeStateResponse {
  readonly mode: ActuatorMode;
  /** The modes the UI may offer, so the client never hardcodes the list. */
  readonly modes: readonly ActuatorMode[];
}

export function registerActuatorModeRoutes(server: FastifyInstance, gate: ActuatorModeRoutesGate): void {
  server.get("/api/settings/actuators", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }
    const { mode } = await readActuatorConfigSafe(gate.configFile);
    const response: ActuatorModeStateResponse = { mode, modes: ACTUATOR_MODES };
    return response;
  });

  server.patch("/api/settings/actuators", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }
    const body = request.body as { mode?: unknown } | undefined;
    const mode = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "";
    // Reject an unknown mode LOUDLY. writeActuatorConfig would normalise it to
    // `off`, so a silently-accepted typo would report success and change nothing.
    if (!isActuatorMode(mode)) {
      const reason = `mode must be one of: ${ACTUATOR_MODES.join(", ")}`;
      return reply.status(400).send({ message: reason, reason });
    }
    await writeActuatorConfig(gate.configFile, { mode });
    const response: ActuatorModeStateResponse = { mode, modes: ACTUATOR_MODES };
    return response;
  });
}
