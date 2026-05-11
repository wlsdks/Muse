/**
 * Coverage for `GET /api/active-context`. The route is a thin reply
 * over the injected `ActiveContextProvider`, so we drive it through
 * `buildServer` with a stub provider and assert the snapshot lands
 * unmolested. The 404 path covers the disabled (`undefined` provider)
 * case so the personal-JARVIS opt-out via
 * `MUSE_ACTIVE_CONTEXT_ENABLED=false` stays honored end-to-end.
 */

import type { ActiveContextProvider, ActiveContextSnapshot } from "@muse/agent-core";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

function stubProvider(snapshot: ActiveContextSnapshot | undefined): ActiveContextProvider {
  return {
    resolve: () => snapshot
  };
}

describe("GET /api/active-context", () => {
  it("returns the resolved snapshot when a provider is wired", async () => {
    const snapshot: ActiveContextSnapshot = {
      localHour: 14,
      nowIso: "2026-05-11T05:23:00.000Z",
      timezone: "Asia/Seoul",
      weekday: "Monday"
    };
    const server = buildServer({
      activeContextProvider: stubProvider(snapshot),
      logger: false
    });
    const response = await server.inject({ method: "GET", url: "/api/active-context" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(snapshot);
  });

  it("returns 404 when the active-context provider is not wired", async () => {
    const server = buildServer({ logger: false });
    const response = await server.inject({ method: "GET", url: "/api/active-context" });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { readonly error?: string };
    expect(body.error).toMatch(/active context/iu);
  });

  it("forwards userId / sessionId query params to the provider", async () => {
    const received: { userId?: string; sessionId?: string } = {};
    const provider: ActiveContextProvider = {
      resolve(options) {
        const opts = typeof options === "string" ? { userId: options } : options;
        if (opts?.userId) { received.userId = opts.userId; }
        if (opts?.sessionId) { received.sessionId = opts.sessionId; }
        return {
          localHour: 9,
          nowIso: "2026-05-11T00:00:00.000Z",
          timezone: "UTC",
          weekday: "Monday"
        };
      }
    };
    const server = buildServer({ activeContextProvider: provider, logger: false });
    const response = await server.inject({
      method: "GET",
      url: "/api/active-context?userId=alice&sessionId=session-42"
    });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual({ sessionId: "session-42", userId: "alice" });
  });
});
