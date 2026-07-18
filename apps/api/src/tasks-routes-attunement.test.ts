import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createLocalArtifactValidator,
  createLocalExactArtifactResolver,
  createPersonalThread,
  linkArtifact,
  openPreparedContinuityPack,
  readAttunementState
} from "@muse/attunement";
import { writeTasks } from "@muse/stores";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { registerTasksRoutes } from "./tasks-routes.js";

describe("task completion Continuity composition", () => {
  it("records factual evidence after the authenticated task route commits open to done", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-task-interaction-api-"));
    const attunementFile = join(root, "attunement.json");
    const notesDir = join(root, "notes");
    const tasksFile = join(root, "tasks.json");
    await mkdir(notesDir);
    await writeTasks(tasksFile, [{ createdAt: "2026-07-18T00:00:00.000Z", id: "task_api_done", status: "open", title: "Complete through API" }]);
    const thread = await createPersonalThread(attunementFile, { kind: "work", title: "API interaction" });
    await linkArtifact(attunementFile, {
      artifactId: "task_api_done", artifactType: "task", role: "next-step", threadId: thread.id
    }, { validateArtifact: createLocalArtifactValidator({ notesDir, tasksFile }) });
    const opened = await openPreparedContinuityPack(
      attunementFile,
      thread.id,
      createLocalExactArtifactResolver({ notesDir, tasksFile }),
      { now: () => Date.parse("2026-07-18T01:00:00.000Z") }
    );
    const app = Fastify();
    registerTasksRoutes(app, { attunementFile, authService: undefined, tasksFile });
    try {
      const response = await app.inject({ method: "POST", url: "/api/tasks/task_api_done/complete" });
      expect(response.statusCode).toBe(200);
      const state = await readAttunementState(attunementFile);
      expect(state.interactionReceipts).toContainEqual(expect.objectContaining({
        artifactId: "task_api_done",
        deliveryId: opened.delivery.id,
        transition: "open-to-done"
      }));
      expect(state.deliveries[0]?.outcome).toBeUndefined();
    } finally {
      await app.close();
      await rm(root, { recursive: true });
    }
  });
});
