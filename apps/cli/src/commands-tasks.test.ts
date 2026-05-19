import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerTasksCommands, type TasksCommandHelpers } from "./commands-tasks.js";

interface ApiCall {
  readonly path: string;
  readonly body?: Record<string, unknown>;
  readonly method?: string;
}

async function runTasks(args: string[]): Promise<{
  readonly error?: string;
  readonly apiCalls: readonly ApiCall[];
}> {
  const apiCalls: ApiCall[] = [];
  const io = { stderr: () => {}, stdout: () => {} };
  const helpers: TasksCommandHelpers = {
    apiRequest: async (_io, _command, path, body, method) => {
      apiCalls.push({ body, method, path });
      return { id: "task_remote", status: "open", title: String(body?.title ?? "") };
    },
    writeOutput: () => {}
  };
  let error: string | undefined;
  try {
    const program = new Command();
    program.exitOverride();
    registerTasksCommands(program, io, helpers);
    await program.parseAsync(["node", "muse", "tasks", "add", ...args]);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { apiCalls, error };
}

describe("muse tasks add — pre-dispatch --due validation", () => {
  it("remote mode rejects an invalid --due with the actionable error BEFORE any API call", async () => {
    const r = await runTasks(["ship", "the", "release", "--due", "blah-not-a-time"]);
    expect(r.error).toBeDefined();
    expect(r.error).toContain("ISO-8601");
    expect(r.error).toContain("relative phrase");
    expect(r.apiCalls).toHaveLength(0);
  });

  it("remote mode still sends a VALID --due raw to the API (server stays the resolution authority)", async () => {
    const r = await runTasks(["stand", "up", "--due", "in 3 hours"]);
    expect(r.error).toBeUndefined();
    expect(r.apiCalls).toHaveLength(1);
    expect(r.apiCalls[0]!.path).toBe("/api/tasks");
    expect(r.apiCalls[0]!.body).toMatchObject({ dueAt: "in 3 hours", title: "stand up" });
  });

  it("a task with no --due still posts (no spurious dueAt, no validation error)", async () => {
    const r = await runTasks(["just", "a", "title"]);
    expect(r.error).toBeUndefined();
    expect(r.apiCalls).toHaveLength(1);
    expect(r.apiCalls[0]!.body).toMatchObject({ title: "just a title" });
    expect(r.apiCalls[0]!.body?.dueAt).toBeUndefined();
  });

  it("local mode keeps rejecting an invalid --due with the same actionable error", async () => {
    const r = await runTasks(["--local", "do", "thing", "--due", "still-not-a-time"]);
    expect(r.error).toBeDefined();
    expect(r.error).toContain("relative phrase");
    expect(r.apiCalls).toHaveLength(0);
  });
});
