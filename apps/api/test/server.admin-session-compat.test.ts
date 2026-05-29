import { InMemoryAgentRunHistoryStore } from "@muse/runtime-state";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

// Route-integration (backlog P2): the Spring-compat admin-sessions route group
// (admin-session-compat-routes.ts) — the companion-session admin surface (runs
// overview / paginated list / detail / delete + tag 4xx). buildServer with no
// authService leaves requireAuthenticated open (personal-use default), so the
// group is exercisable; a seeded InMemoryAgentRunHistoryStore supplies the runs.

const seededHistory = () => {
  const store = new InMemoryAgentRunHistoryStore();
  store.createRun({ id: "run-ok", input: "hi", model: "diagnostic/smoke", provider: "diagnostic", status: "completed" });
  store.createRun({ id: "run-bad", input: "hi", model: "diagnostic/smoke", provider: "diagnostic", status: "failed" });
  store.createRun({ id: "run-live", input: "hi", model: "diagnostic/smoke", provider: "diagnostic", status: "running" });
  return store;
};

describe("api server: /api/admin/sessions/* (Spring-compat admin sessions)", () => {
  const servers: { close: () => Promise<unknown> }[] = [];
  const makeServer = (historyStore = seededHistory()) => {
    const s = buildServer({ historyStore, logger: false });
    servers.push(s);
    return s;
  };
  afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); });

  it("overview tallies runs by status", async () => {
    const res = await makeServer().inject({ method: "GET", url: "/api/admin/sessions/overview" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ completed: 1, failed: 1, running: 1, total: 3 });
  });

  it("lists sessions with pagination echo (limit/offset/total + items)", async () => {
    const res = await makeServer().inject({ method: "GET", url: "/api/admin/sessions?limit=2&offset=0" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; limit: number; offset: number; total: number };
    expect(body).toMatchObject({ limit: 2, offset: 0, total: 3 });
    expect(body.items.length).toBeLessThanOrEqual(2);
  });

  it("returns a session's detail with an (empty) tags array", async () => {
    const res = await makeServer().inject({ method: "GET", url: "/api/admin/sessions/run-ok" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tags: [] });
  });

  it("DELETE removes an existing session (204), and deleting it again 404s", async () => {
    const server = makeServer();
    expect((await server.inject({ method: "DELETE", url: "/api/admin/sessions/run-ok" })).statusCode).toBe(204);
    const gone = await server.inject({ method: "DELETE", url: "/api/admin/sessions/run-ok" });
    expect(gone.statusCode).toBe(404);
    expect((gone.json() as { code: string }).code).toBe("SESSION_NOT_FOUND");
  });

  it("DELETE of an unknown session id 404s", async () => {
    expect((await makeServer().inject({ method: "DELETE", url: "/api/admin/sessions/nope" })).statusCode).toBe(404);
  });

  it("rejects a tag POST with no label (400)", async () => {
    const res = await makeServer().inject({ method: "POST", payload: {}, url: "/api/admin/sessions/run-ok/tags" });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error?: string; message?: string }).message ?? (res.json() as { error?: string }).error).toContain("label");
  });
});
