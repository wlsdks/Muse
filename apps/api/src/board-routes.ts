/**
 * `GET /api/board` — read-only feed of the durable agent task board for the web Kanban view.
 * Reads the same persisted board the CLI (`muse board`) drives, so the desktop UI and the CLI
 * show one shared board. Read-only for now (the CLI owns mutations); a write surface can follow.
 */

import { FileAgentTaskBoard, type AgentTask } from "@muse/multi-agent";
import type { FastifyInstance } from "fastify";

export interface BoardRoutesOptions {
  /** Override the board source (tests inject a fake); defaults to the on-disk board. */
  readonly listTasks?: () => Promise<readonly AgentTask[]>;
}

export function registerBoardRoutes(server: FastifyInstance, options: BoardRoutesOptions = {}): void {
  const listTasks = options.listTasks ?? (() => new FileAgentTaskBoard().list());
  server.get("/api/board", async (_request, reply) => {
    const tasks = await listTasks();
    return reply.send({ tasks });
  });
}
