import type { ModelProvider, ModelRequest, ModelResponse, ModelToolCall } from "@muse/model";
import { describe, expect, it } from "vitest";

import { executeModelLoop, type ModelLoopRunner } from "../src/model-loop.js";
import type { ToolCallMiddleware } from "../src/tool-call-middleware.js";
import type { ExecutedToolResult } from "../src/runtime-internals.js";
import type { AgentRunContext } from "../src/types.js";

// TX-9: a deterministic pre-call middleware can VETO a tool call before it runs.

const provider = {} as unknown as ModelProvider;
const readTool = { name: "web_search", description: "s", inputSchema: { type: "object" as const }, risk: "read" as const };
const fsTool = { name: "muse.fs.read", description: "r", inputSchema: { type: "object" as const }, risk: "read" as const };

const context = (): AgentRunContext => ({
  runId: "run-mw",
  startedAt: new Date("2026-01-01T00:00:00Z"),
  input: { model: "m", messages: [{ role: "user", content: "go" }] }
});
const request = (): ModelRequest => ({ model: "m", messages: [{ role: "user", content: "go" }], tools: [readTool, fsTool] });

function runner(batch: readonly ModelToolCall[], ran: ModelToolCall[], middleware?: readonly ToolCallMiddleware[]): ModelLoopRunner {
  let turn = 0;
  return {
    maxToolCalls: 10,
    ...(middleware ? { toolCallMiddleware: middleware } : {}),
    generateWithTracing: async (): Promise<ModelResponse> => {
      turn += 1;
      if (turn === 1) return { id: "x1", model: "m", output: "working", toolCalls: [...batch] };
      return { id: "fin", model: "m", output: "done", toolCalls: [] };
    },
    executeToolCall: async (_ctx, toolCall): Promise<ExecutedToolResult> => {
      ran.push(toolCall);
      return { result: { id: toolCall.id, name: toolCall.name, output: "ok", status: "completed" }, toolCall };
    }
  } as unknown as ModelLoopRunner;
}

const tc = (id: string, name: string): ModelToolCall => ({ id, name, arguments: {} as ModelToolCall["arguments"] });

describe("executeModelLoop — tool-call middleware veto (TX-9)", () => {
  it("blocks a vetoed tool (it never reaches executeToolCall) while an allowed tool still runs", async () => {
    const ran: ModelToolCall[] = [];
    const allowlist: ToolCallMiddleware = (call) =>
      call.name.startsWith("muse.fs.") ? { action: "allow" } : { action: "block", reason: "not on allowlist" };
    const result = await executeModelLoop(
      runner([tc("c1", "web_search"), tc("c2", "muse.fs.read")], ran, [allowlist]),
      context(),
      provider,
      request()
    );
    expect(ran.map((c) => c.name)).toEqual(["muse.fs.read"]); // web_search vetoed, never executed
    expect(result.finalResponse.output).toBe("done");
  });

  it("is a no-op with no middleware: every tool runs (byte-identical path)", async () => {
    const ran: ModelToolCall[] = [];
    await executeModelLoop(
      runner([tc("c1", "web_search"), tc("c2", "muse.fs.read")], ran),
      context(),
      provider,
      request()
    );
    expect(ran.map((c) => c.name).sort()).toEqual(["muse.fs.read", "web_search"]);
  });
});
