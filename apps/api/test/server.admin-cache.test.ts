import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

describe("Cache-Control: no-store on /api/admin/*", () => {
  it("admin response has Cache-Control: no-store", async () => {
    const server = buildServer({ logger: false });
    // Any /api/admin/* route works — doctor/summary is light and
    // already wired without needing extra options.
    const reply = await server.inject({ method: "GET", url: "/api/admin/doctor/summary" });
    expect(reply.headers["cache-control"]).toBe("no-store");
  });

  it("non-admin response does NOT carry no-store (lock-in that the hook is path-scoped)", async () => {
    const server = buildServer({ logger: false });
    const reply = await server.inject({ method: "GET", url: "/health" });
    // /health is a public endpoint; Cache-Control should NOT be
    // forced to no-store. Fastify's default doesn't set the header
    // so the absence is the signal.
    expect(reply.headers["cache-control"]).toBeUndefined();
  });
});
