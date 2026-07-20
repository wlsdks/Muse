import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerActuatorModeRoutes, type ActuatorModeStateResponse } from "./actuator-mode-routes.js";

let root: string;
let configFile: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "muse-actuator-api-"));
  configFile = join(root, "config.json");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function server() {
  const s = Fastify();
  registerActuatorModeRoutes(s, { authService: undefined, configFile });
  return s;
}

describe("GET /api/settings/actuators", () => {
  it("an absent config reads as off (the fail-closed default)", async () => {
    const res = await server().inject({ method: "GET", url: "/api/settings/actuators" });
    expect(res.statusCode).toBe(200);
    const body = res.json<ActuatorModeStateResponse>();
    expect(body.mode).toBe("off");
    expect(body.modes).toEqual(["off", "ask", "auto"]);
  });

  it("a corrupt config reads as off rather than 500-ing the endpoint", async () => {
    await writeFile(configFile, "{ not json", "utf8");
    const res = await server().inject({ method: "GET", url: "/api/settings/actuators" });
    expect(res.statusCode).toBe(200);
    expect(res.json<ActuatorModeStateResponse>().mode).toBe("off");
  });

  it("reports a stored mode", async () => {
    await writeFile(configFile, JSON.stringify({ actuators: { mode: "ask" } }), "utf8");
    const res = await server().inject({ method: "GET", url: "/api/settings/actuators" });
    expect(res.json<ActuatorModeStateResponse>().mode).toBe("ask");
  });
});

describe("PATCH /api/settings/actuators", () => {
  it("sets a valid mode and persists it", async () => {
    const res = await server().inject({ method: "PATCH", url: "/api/settings/actuators", payload: { mode: "auto" } });
    expect(res.statusCode).toBe(200);
    expect(res.json<ActuatorModeStateResponse>().mode).toBe("auto");

    const parsed = JSON.parse(await readFile(configFile, "utf8")) as Record<string, unknown>;
    expect(parsed.actuators).toEqual({ mode: "auto" });
  });

  it("normalises case and surrounding whitespace", async () => {
    const res = await server().inject({ method: "PATCH", url: "/api/settings/actuators", payload: { mode: " ASK " } });
    expect(res.json<ActuatorModeStateResponse>().mode).toBe("ask");
  });

  it("rejects an unknown mode with 400 and stores NOTHING", async () => {
    const res = await server().inject({ method: "PATCH", url: "/api/settings/actuators", payload: { mode: "automatic" } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ reason: string }>().reason).toMatch(/off, ask, auto/u);
    // The write must not have happened — a rejected PATCH leaves no config file.
    await expect(readFile(configFile, "utf8")).rejects.toThrow();
  });

  it("rejects a missing/non-string mode with 400", async () => {
    for (const payload of [{}, { mode: 1 }, { mode: null }, { mode: ["auto"] }]) {
      const res = await server().inject({ method: "PATCH", url: "/api/settings/actuators", payload });
      expect(res.statusCode).toBe(400);
    }
  });

  it("preserves unrelated config keys on write", async () => {
    await writeFile(configFile, JSON.stringify({ defaultModel: "ollama/gemma4:12b", dayRhythm: { enabled: true } }), "utf8");
    await server().inject({ method: "PATCH", url: "/api/settings/actuators", payload: { mode: "ask" } });

    const parsed = JSON.parse(await readFile(configFile, "utf8")) as Record<string, unknown>;
    expect(parsed.defaultModel).toBe("ollama/gemma4:12b");
    expect(parsed.dayRhythm).toEqual({ enabled: true });
    expect(parsed.actuators).toEqual({ mode: "ask" });
  });
});

describe("auth gate", () => {
  // `requireAuthenticated` gates on `Boolean(authService)` and then on an
  // identity attached to the request by the auth plugin. With an authService
  // present and no identity attached, BOTH routes must 401 — and the PATCH must
  // additionally not write, since a 401 that still mutated would be worse than
  // a leak of the current value.
  it("401s both routes when auth is on and the request carries no identity", async () => {
    const s = Fastify();
    registerActuatorModeRoutes(s, { authService: {} as never, configFile });

    const get = await s.inject({ method: "GET", url: "/api/settings/actuators" });
    expect(get.statusCode).toBe(401);

    const patch = await s.inject({ method: "PATCH", url: "/api/settings/actuators", payload: { mode: "auto" } });
    expect(patch.statusCode).toBe(401);
    await expect(readFile(configFile, "utf8")).rejects.toThrow();
  });

  it("allows both routes when no auth service is configured (local single-user default)", async () => {
    const s = server();
    expect((await s.inject({ method: "GET", url: "/api/settings/actuators" })).statusCode).toBe(200);
    expect((await s.inject({ method: "PATCH", url: "/api/settings/actuators", payload: { mode: "ask" } })).statusCode).toBe(200);
  });
});
