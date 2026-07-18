/**
 * `/api/day-rhythm` — the one-click "하루 리듬" (day rhythm) toggle the web
 * console's Home card drives.
 *
 *   - GET  /api/day-rhythm   current state + whether a channel is paired
 *   - POST /api/day-rhythm   { enabled, morningHour?, eveningHour? }
 *
 * State lives in `~/.config/muse/config.json`'s `dayRhythm` block
 * (`@muse/autoconfigure`'s `readDayRhythmConfig`/`writeDayRhythmConfig`) —
 * the SAME file the CLI daemon's briefing/digest ticks read live every
 * tick, so a toggle here takes effect on the daemon's next cycle with no
 * restart. This route never talks to the daemon process directly.
 */

import { readDayRhythmConfig, resolveSinglePairedChannel, writeDayRhythmConfig, type PairedChannel } from "@muse/autoconfigure";
import type { MessagingProviderRegistry } from "@muse/messaging";
import type { FastifyInstance } from "fastify";

import { requireAuthenticated } from "./server-helpers.js";
import type { ServerOptions } from "./server.js";

export interface DayRhythmRoutesGate {
  readonly authService?: ServerOptions["authService"];
  readonly configFile: string;
  readonly channelOwnersFile: string;
  readonly registry?: MessagingProviderRegistry;
}

export interface DayRhythmStateResponse {
  readonly enabled: boolean;
  readonly morningHour: number;
  readonly eveningHour: number;
  readonly pairedChannel: PairedChannel | null;
}

async function resolvePairedChannel(gate: DayRhythmRoutesGate): Promise<PairedChannel | null> {
  if (!gate.registry) {
    return null;
  }
  const paired = await resolveSinglePairedChannel(gate.channelOwnersFile, gate.registry);
  return paired ?? null;
}

function isFiniteHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23;
}

export function registerDayRhythmRoutes(server: FastifyInstance, gate: DayRhythmRoutesGate): void {
  server.get("/api/day-rhythm", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }
    const [config, pairedChannel] = await Promise.all([
      readDayRhythmConfig(gate.configFile),
      resolvePairedChannel(gate)
    ]);
    const response: DayRhythmStateResponse = { ...config, pairedChannel };
    return response;
  });

  server.post("/api/day-rhythm", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }
    const body = request.body as { enabled?: unknown; morningHour?: unknown; eveningHour?: unknown } | undefined;
    if (typeof body?.enabled !== "boolean") {
      return reply.status(400).send({ message: "enabled (boolean) is required", reason: "enabled (boolean) is required" });
    }
    if (body.morningHour !== undefined && !isFiniteHour(body.morningHour)) {
      const reason = "morningHour must be an integer between 0 and 23";
      return reply.status(400).send({ message: reason, reason });
    }
    if (body.eveningHour !== undefined && !isFiniteHour(body.eveningHour)) {
      const reason = "eveningHour must be an integer between 0 and 23";
      return reply.status(400).send({ message: reason, reason });
    }
    const current = await readDayRhythmConfig(gate.configFile);
    const next = await writeDayRhythmConfig(gate.configFile, {
      enabled: body.enabled,
      eveningHour: isFiniteHour(body.eveningHour) ? body.eveningHour : current.eveningHour,
      morningHour: isFiniteHour(body.morningHour) ? body.morningHour : current.morningHour
    });
    const pairedChannel = await resolvePairedChannel(gate);
    const response: DayRhythmStateResponse = { ...next, pairedChannel };
    return response;
  });
}
