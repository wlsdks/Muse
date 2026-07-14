import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentRunInput } from "@muse/agent-core";
import { listPendingApprovals, recordPendingApproval, type PendingApproval } from "@muse/messaging";
import type { JsonObject } from "@muse/shared";
import type { MuseTool, ToolExecutionValue } from "@muse/tools";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeChatApproval } from "./chat-approval-execute.js";
import { runChat } from "./server-helpers.js";
import type { ServerOptions } from "./server.js";

let dir: string;
let pendingFile: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "muse-chat-write-"));
  pendingFile = join(dir, "pending-approvals.json");
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

interface FakeRuntime {
  readonly captured: AgentRunInput[];
  run(input: AgentRunInput): Promise<unknown>;
  stream(): AsyncIterable<unknown>;
}

/**
 * A runtime that records each run input and — when a run-scoped approval gate
 * is wired — simulates the model attempting exactly one `muse.tasks.add` write,
 * so the gate's capture/deny path is exercised without a real model.
 */
function fakeRuntime(): FakeRuntime {
  const captured: AgentRunInput[] = [];
  let gated = false;
  return {
    captured,
    async run(input: AgentRunInput) {
      captured.push(input);
      if (input.toolApprovalGate && !gated) {
        gated = true;
        await input.toolApprovalGate({
          risk: "write",
          runId: "r1",
          toolCall: { arguments: { title: "Buy milk" }, id: "c1", name: "muse.tasks.add" }
        });
      }
      return { response: { model: "test-model", output: "Understood." }, runId: "r1", toolsUsed: [], groundingSources: [] };
    },
    // eslint-disable-next-line require-yield
    async *stream() {
      throw new Error("stream unused in this test");
    }
  };
}

function recordingTool(name: string, result: unknown): { readonly tool: MuseTool; readonly calls: JsonObject[] } {
  const calls: JsonObject[] = [];
  const tool: MuseTool = {
    definition: { description: "test", inputSchema: {}, name, risk: "write" },
    execute(args: JsonObject) {
      calls.push(args);
      return result as ToolExecutionValue;
    }
  };
  return { calls, tool };
}

function optionsFor(runtime: FakeRuntime, env: Record<string, string | undefined>): ServerOptions {
  return {
    agentRuntime: runtime as unknown as ServerOptions["agentRuntime"],
    defaultModel: "test-model",
    env
  } as ServerOptions;
}

const stubReply = {
  status: () => ({ send: () => undefined }),
  header: () => undefined,
  send: () => undefined
};

describe("runChat write-approval wiring", () => {
  it("flag OFF: no authority/gate on the run input, nothing persisted", async () => {
    const runtime = fakeRuntime();
    const options = optionsFor(runtime, { MUSE_PENDING_APPROVALS_FILE: pendingFile });
    const res = await runChat({ message: "add buy milk" }, stubReply, options, "compat") as { content: string };
    expect(runtime.captured[0]?.toolApprovalGate).toBeUndefined();
    expect(runtime.captured[0]?.toolExposureAuthority).toBeUndefined();
    expect(res.content).not.toContain("needs your approval");
    expect(await listPendingApprovals(pendingFile)).toHaveLength(0);
  });

  it("flag ON: write is captured (not executed), persisted, and the notice appended", async () => {
    const runtime = fakeRuntime();
    const options = optionsFor(runtime, { MUSE_CHAT_WRITE_ENABLED: "true", MUSE_PENDING_APPROVALS_FILE: pendingFile });
    const res = await runChat({ message: "add buy milk", userId: "owner" }, stubReply, options, "compat") as { content: string };

    expect(runtime.captured[0]?.toolApprovalGate).toBeDefined();
    expect(runtime.captured[0]?.toolExposureAuthority).toBeDefined();

    const pending = await listPendingApprovals(pendingFile);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      arguments: { title: "Buy milk" },
      draft: "title=Buy milk",
      providerId: "chat",
      risk: "write",
      source: "api-chat",
      tool: "muse.tasks.add",
      userId: "owner"
    });

    expect(res.content).toContain("🔒 These actions need your approval before I run them:");
    expect(res.content).toContain("muse.tasks.add");
  });
});

function pendingEntry(overrides: Partial<PendingApproval> & Pick<PendingApproval, "id" | "tool">): PendingApproval {
  const now = Date.now();
  return {
    arguments: { title: "Buy milk" },
    createdAt: new Date(now).toISOString(),
    draft: "title=Buy milk",
    expiresAt: new Date(now + 60_000).toISOString(),
    providerId: "chat",
    risk: "write",
    source: "api-chat",
    ...overrides
  };
}

describe("executeChatApproval confirm-execute", () => {
  it("confirms a valid id: executes once and clears the entry", async () => {
    await recordPendingApproval(pendingFile, pendingEntry({ id: "a1", tool: "muse.tasks.add" }));
    const { tool, calls } = recordingTool("muse.tasks.add", { ok: true });

    const out = await executeChatApproval({ id: "a1", pendingFile, resolveTool: () => tool });

    expect(out.statusCode).toBe(200);
    expect(out.body).toMatchObject({ ran: true, tool: "muse.tasks.add" });
    expect(calls).toEqual([{ title: "Buy milk" }]);
    expect(await listPendingApprovals(pendingFile)).toHaveLength(0);
  });

  it("unknown id: 404, no execution", async () => {
    const { tool, calls } = recordingTool("muse.tasks.add", { ok: true });
    const out = await executeChatApproval({ id: "missing", pendingFile, resolveTool: () => tool });
    expect(out.statusCode).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("expired id: 404, no execution", async () => {
    await recordPendingApproval(pendingFile, pendingEntry({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      id: "expired",
      tool: "muse.tasks.add"
    }));
    const { tool, calls } = recordingTool("muse.tasks.add", { ok: true });
    const out = await executeChatApproval({ id: "expired", pendingFile, resolveTool: () => tool });
    expect(out.statusCode).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("replay: a second approve of the same id executes nothing and 404s", async () => {
    await recordPendingApproval(pendingFile, pendingEntry({ id: "r1", tool: "muse.tasks.add" }));
    const { tool, calls } = recordingTool("muse.tasks.add", { ok: true });

    const first = await executeChatApproval({ id: "r1", pendingFile, resolveTool: () => tool });
    const second = await executeChatApproval({ id: "r1", pendingFile, resolveTool: () => tool });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("resolver missing: 409, no execution", async () => {
    await recordPendingApproval(pendingFile, pendingEntry({ id: "n1", tool: "muse.tasks.add" }));
    const out = await executeChatApproval({ id: "n1", pendingFile });
    expect(out.statusCode).toBe(409);
    expect(await listPendingApprovals(pendingFile)).toHaveLength(1);
  });

  it("unknown tool: 409, no execution, entry left pending", async () => {
    await recordPendingApproval(pendingFile, pendingEntry({ id: "u1", tool: "muse.tasks.add" }));
    const out = await executeChatApproval({ id: "u1", pendingFile, resolveTool: () => undefined });
    expect(out.statusCode).toBe(409);
    expect(await listPendingApprovals(pendingFile)).toHaveLength(1);
  });

  it("error-shaped tool result: ran:false and the entry stays pending", async () => {
    await recordPendingApproval(pendingFile, pendingEntry({ id: "e1", tool: "muse.tasks.add" }));
    const { tool, calls } = recordingTool("muse.tasks.add", { error: "provider down" });

    const out = await executeChatApproval({ id: "e1", pendingFile, resolveTool: () => tool });

    expect(out.statusCode).toBe(200);
    expect(out.body).toMatchObject({ ran: false, tool: "muse.tasks.add" });
    expect(calls).toHaveLength(1);
    expect(await listPendingApprovals(pendingFile)).toHaveLength(1);
  });
});
