import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { registerBoardRoutes } from "./board-routes.js";

describe("GET /api/board — the web Kanban feed", () => {
  it("returns the board tasks from the injected source", async () => {
    const server = Fastify();
    registerBoardRoutes(server, {
      listTasks: async () => [
        { createdAt: "t", dependsOn: [], id: "a", runs: [], status: "todo", title: "x", updatedAt: "t" },
        { createdAt: "t", decomposed: true, dependsOn: ["a"], id: "c", runs: [], status: "todo", synthesize: true, title: "container", updatedAt: "t" }
      ]
    });
    const res = await server.inject({ method: "GET", url: "/api/board" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { tasks: { id: string; synthesize?: boolean }[] };
    expect(body.tasks.map((t) => t.id)).toEqual(["a", "c"]);
    expect(body.tasks[1]!.synthesize).toBe(true);
    await server.close();
  });
  it("an empty board returns an empty tasks array (never errors)", async () => {
    const server = Fastify();
    registerBoardRoutes(server, { listTasks: async () => [] });
    const res = await server.inject({ method: "GET", url: "/api/board" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ tasks: [] });
    await server.close();
  });
});
