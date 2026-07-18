import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MessagingProviderRegistry, type MessagingProvider } from "@muse/messaging";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerDayRhythmRoutes, type DayRhythmStateResponse } from "./day-rhythm-routes.js";

let root: string;
let configFile: string;
let channelOwnersFile: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "muse-day-rhythm-api-"));
  configFile = join(root, "config.json");
  channelOwnersFile = join(root, "channel-owners.json");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fakeTelegramProvider(): MessagingProvider {
  return {
    describe: () => ({ description: "t", displayName: "Telegram", id: "telegram" }),
    id: "telegram",
    async send(message) {
      return { destination: message.destination, messageId: "m1", providerId: "telegram" };
    }
  };
}

describe("GET /api/day-rhythm", () => {
  it("an absent config file reads as disabled defaults with no paired channel", async () => {
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    const res = await server.inject({ method: "GET", url: "/api/day-rhythm" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as DayRhythmStateResponse;
    expect(body).toEqual({ enabled: false, eveningHour: 18, morningHour: 8, pairedChannel: null });
  });

  it("reports a paired channel when one provider is BOTH configured (registered) AND paired", async () => {
    await writeFile(channelOwnersFile, JSON.stringify({ owners: { telegram: "555" }, version: 1 }));
    const registry = new MessagingProviderRegistry([fakeTelegramProvider()]);
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile, registry });
    const res = await server.inject({ method: "GET", url: "/api/day-rhythm" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as DayRhythmStateResponse;
    expect(body.pairedChannel).toEqual({ destination: "555", providerId: "telegram" });
  });

  it("a paired owner with NO live-registered provider reports no paired channel", async () => {
    await writeFile(channelOwnersFile, JSON.stringify({ owners: { telegram: "555" }, version: 1 }));
    const server = Fastify();
    // No registry injected at all — mirrors messaging never having been configured.
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    const res = await server.inject({ method: "GET", url: "/api/day-rhythm" });
    const body = JSON.parse(res.body) as DayRhythmStateResponse;
    expect(body.pairedChannel).toBeNull();
  });
});

describe("POST /api/day-rhythm", () => {
  it("enables day rhythm with default hours when none are given", async () => {
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    const res = await server.inject({ method: "POST", payload: { enabled: true }, url: "/api/day-rhythm" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as DayRhythmStateResponse;
    expect(body).toEqual({ enabled: true, eveningHour: 18, morningHour: 8, pairedChannel: null });

    // Persisted — a follow-up GET reads the same state back.
    const getRes = await server.inject({ method: "GET", url: "/api/day-rhythm" });
    expect(JSON.parse(getRes.body)).toEqual(body);
  });

  it("enables with custom hours and round-trips them", async () => {
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    const res = await server.inject({
      method: "POST",
      payload: { enabled: true, eveningHour: 19, morningHour: 7 },
      url: "/api/day-rhythm"
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ enabled: true, eveningHour: 19, morningHour: 7, pairedChannel: null });
  });

  it("disables day rhythm (toggling off)", async () => {
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    await server.inject({ method: "POST", payload: { enabled: true }, url: "/api/day-rhythm" });
    const res = await server.inject({ method: "POST", payload: { enabled: false }, url: "/api/day-rhythm" });
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(res.body) as DayRhythmStateResponse).enabled).toBe(false);
  });

  it("rejects a missing/non-boolean 'enabled' (400, no write)", async () => {
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    const res = await server.inject({ method: "POST", payload: {}, url: "/api/day-rhythm" });
    expect(res.statusCode).toBe(400);
    const after = await server.inject({ method: "GET", url: "/api/day-rhythm" });
    expect((JSON.parse(after.body) as DayRhythmStateResponse).enabled).toBe(false);
  });

  it("rejects an out-of-range morningHour (400, no write)", async () => {
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    const res = await server.inject({ method: "POST", payload: { enabled: true, morningHour: 24 }, url: "/api/day-rhythm" });
    expect(res.statusCode).toBe(400);
    const after = await server.inject({ method: "GET", url: "/api/day-rhythm" });
    expect((JSON.parse(after.body) as DayRhythmStateResponse).enabled).toBe(false);
  });

  it("preserves apiUrl/defaultModel already in config.json (read-merge-write)", async () => {
    await writeFile(configFile, JSON.stringify({ apiUrl: "http://api.example", defaultModel: "ollama/gemma4:12b" }));
    const server = Fastify();
    registerDayRhythmRoutes(server, { authService: undefined, channelOwnersFile, configFile });
    await server.inject({ method: "POST", payload: { enabled: true }, url: "/api/day-rhythm" });
    const raw = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configFile, "utf8"))) as Record<string, unknown>;
    expect(raw.apiUrl).toBe("http://api.example");
    expect(raw.defaultModel).toBe("ollama/gemma4:12b");
  });
});
