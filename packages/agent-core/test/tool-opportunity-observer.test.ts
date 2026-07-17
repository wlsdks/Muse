import { createToolExposureAuthority } from "@muse/policy";
import { ToolRegistry, createDefaultToolExposurePolicy, type MuseTool } from "@muse/tools";
import type { ModelProvider } from "@muse/model";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";

import {
  createAgentRuntime,
  parseToolPlan,
  ToolPlanStepBlockedError,
  type AgentRunContext,
  type ToolOpportunityObserverInput
} from "../src/index.js";

const provider: ModelProvider = {
  id: "noop",
  async generate() { throw new Error("model must not be called"); },
  async listModels() { return []; },
  async *stream() { /* unused */ }
};

const tool: MuseTool = {
  definition: {
    description: "observer test write",
    inputSchema: {
      properties: {
        count: { type: "number" },
        mode: { enum: ["safe", "fast"], type: "string" },
        nested: { type: "object" }
      },
      required: ["count", "mode"],
      type: "object"
    },
    name: "test.observed-write",
    risk: "write"
  },
  execute: vi.fn(async (args) => ({ args }))
};

const context: AgentRunContext = {
  input: {
    messages: [{ content: "run it", role: "user" }],
    metadata: { userId: "user-1" },
    model: "provider/model",
    toolExposureAuthority: createToolExposureAuthority({ allowedToolNames: [tool.definition.name] })
  },
  runId: "run-observer",
  startedAt: new Date()
};

function plan(args: Record<string, unknown>) {
  const parsed = parseToolPlan({ result: "$out", steps: [{ args, as: "out", tool: tool.definition.name }] });
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

describe("AgentRuntime toolOpportunityObserver", () => {
  it("observes a detached deeply frozen canonical snapshot before approval while the gate receives the unchanged raw call", async () => {
    const order: string[] = [];
    let observed: ToolOpportunityObserverInput | undefined;
    const raw = { count: "5", mode: "safe", nested: { value: "kept" } };
    const gate = vi.fn((input) => {
      order.push("gate");
      expect(input.toolCall.arguments).toEqual(raw);
      return { allowed: true };
    });
    const runtime = createAgentRuntime({
      modelProvider: provider,
      toolApprovalGate: gate,
      toolExposurePolicy: createDefaultToolExposurePolicy({ allowWriteWithoutMutationIntent: true }),
      toolOpportunityObserver: (input) => {
        order.push("observer");
        observed = input;
      },
      toolRegistry: new ToolRegistry([tool])
    });

    await runtime.executeToolPlanGated(plan(raw), context);

    expect(order).toEqual(["observer", "gate"]);
    expect(gate).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject({
      arguments: { count: 5, mode: "safe", nested: { value: "kept" } },
      runId: "run-observer",
      toolCallId: expect.any(String),
      toolName: "test.observed-write",
      userId: "user-1"
    });
    expect(Object.isFrozen(observed!.arguments)).toBe(true);
    expect(Object.isFrozen(observed!.arguments.nested)).toBe(true);
    expect(observed!.arguments).not.toBe(raw);
  });

  it("does not observe invalid required/enum proposals and preserves the historical approval call before validation failure", async () => {
    const observer = vi.fn();
    const gate = vi.fn(() => ({ allowed: true }));
    const runtime = createAgentRuntime({
      modelProvider: provider,
      toolApprovalGate: gate,
      toolExposurePolicy: createDefaultToolExposurePolicy({ allowWriteWithoutMutationIntent: true }),
      toolOpportunityObserver: observer,
      toolRegistry: new ToolRegistry([tool])
    });

    await expect(runtime.executeToolPlanGated(plan({ mode: "invented" }), context))
      .rejects.toBeInstanceOf(ToolPlanStepBlockedError);

    expect(observer).not.toHaveBeenCalled();
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate.mock.calls[0]![0].toolCall.arguments).toEqual({ mode: "invented" });
  });

  it("ignores observer rejection for both approval allow and deny outcomes", async () => {
    for (const allowed of [true, false]) {
      const gate = vi.fn(() => ({ allowed, ...(allowed ? {} : { reason: "denied" }) }));
      const runtime = createAgentRuntime({
        modelProvider: provider,
        toolApprovalGate: gate,
        toolExposurePolicy: createDefaultToolExposurePolicy({ allowWriteWithoutMutationIntent: true }),
        toolOpportunityObserver: async () => { throw new Error("evidence sink down"); },
        toolRegistry: new ToolRegistry([tool])
      });
      const execution = runtime.executeToolPlanGated(plan({ count: 1, mode: "safe" }), context);
      if (allowed) await expect(execution).resolves.toBeDefined();
      else await expect(execution).rejects.toBeInstanceOf(ToolPlanStepBlockedError);
      expect(gate).toHaveBeenCalledTimes(1);
    }
  });

  it("bounds a hung observer and continues with the unchanged approval input and execution result", async () => {
    const gate = vi.fn(() => ({ allowed: true }));
    const runtime = createAgentRuntime({
      modelProvider: provider,
      toolApprovalGate: gate,
      toolExposurePolicy: createDefaultToolExposurePolicy({ allowWriteWithoutMutationIntent: true }),
      toolOpportunityObserver: () => new Promise(() => undefined),
      toolOpportunityObserverTimeoutMs: 5,
      toolRegistry: new ToolRegistry([tool])
    });

    await expect(runtime.executeToolPlanGated(plan({ count: 1, mode: "safe" }), context)).resolves.toBeDefined();
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate.mock.calls[0]![0].toolCall.arguments).toEqual({ count: 1, mode: "safe" });
  }, 200);

  it("consumes a late observer rejection after timeout without an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const runtime = createAgentRuntime({
        modelProvider: provider,
        toolApprovalGate: () => ({ allowed: true }),
        toolExposurePolicy: createDefaultToolExposurePolicy({ allowWriteWithoutMutationIntent: true }),
        toolOpportunityObserver: () => new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("late evidence failure")), 20);
        }),
        toolOpportunityObserverTimeoutMs: 5,
        toolRegistry: new ToolRegistry([tool])
      });

      await expect(runtime.executeToolPlanGated(plan({ count: 1, mode: "safe" }), context)).resolves.toBeDefined();
      await sleep(30);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("keeps the undefined observer path executing through the same approval and tool result", async () => {
    const gate = vi.fn(() => ({ allowed: true }));
    const runtime = createAgentRuntime({
      modelProvider: provider,
      toolApprovalGate: gate,
      toolExposurePolicy: createDefaultToolExposurePolicy({ allowWriteWithoutMutationIntent: true }),
      toolRegistry: new ToolRegistry([tool])
    });

    await expect(runtime.executeToolPlanGated(plan({ count: 1, mode: "safe" }), context)).resolves.toBeDefined();
    expect(gate).toHaveBeenCalledTimes(1);
  });
});
