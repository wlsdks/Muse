import type { ModelEvent, ModelProvider, ModelRequest, ModelResponse, ModelToolCall } from "@muse/model";
import { describe, expect, it } from "vitest";

import { executeModelLoop, executeStreamingModelLoop, type ModelLoopRunner } from "../src/model-loop.js";
import { POST_COMPACTION_GUARD_WINDOW } from "../src/post-compaction-loop-guard.js";
import type { ExecutedToolResult } from "../src/runtime-internals.js";
import type { AgentRunContext } from "../src/types.js";

const noopSpan = { setAttribute() {}, setError() {}, end() {} };
const tool = { name: "search", description: "search", inputSchema: { type: "object" as const }, risk: "read" as const };

const context = (): AgentRunContext => ({
  runId: "run-post-compaction",
  startedAt: new Date("2026-01-01T00:00:00Z"),
  input: { model: "m", messages: [{ role: "user", content: "find the answer" }] }
});
const request = (): ModelRequest => ({ model: "m", messages: [{ role: "user", content: "find the answer" }], tools: [tool] });
// SAME id, SAME name, SAME args every turn — the exact call the guard targets.
const stuckCall: ModelToolCall = { id: "t1", name: "search", arguments: { q: "same query" } };
const resp = (output: string, toolCalls: ModelToolCall[] = []): ModelResponse => ({ id: "x", model: "m", output, toolCalls });

// executeToolCall returns the SAME output every time it genuinely runs — the
// exact-signature deduplicator will therefore serve every call AFTER the
// first from cache rather than re-executing (see ToolCallDeduplicator). The
// guard must still see one signature per LOOP TURN (fresh execution or
// dedup-served) to catch "compaction didn't break the loop".
function stuckExecuteToolCall(ran: number[]) {
  return async (_ctx: AgentRunContext, toolCall: ModelToolCall): Promise<ExecutedToolResult> => {
    ran.push(ran.length + 1);
    return { result: { id: toolCall.id, name: toolCall.name, output: "no results found", status: "completed" }, toolCall };
  };
}

function blockingStuckRunner(opts: { compactionOccurred?: boolean; maxToolCalls?: number; ran: number[] }): ModelLoopRunner {
  return {
    ...(opts.compactionOccurred !== undefined ? { compactionOccurred: opts.compactionOccurred } : {}),
    maxToolCalls: opts.maxToolCalls ?? 20,
    generateWithTracing: async (): Promise<ModelResponse> => resp("still looking", [stuckCall]),
    executeToolCall: stuckExecuteToolCall(opts.ran)
  } as unknown as ModelLoopRunner;
}

// A stream provider that replays the SAME single tool-call event every turn.
const stuckStreamProvider: ModelProvider = {
  id: "fake",
  stream: async function* (): AsyncGenerator<ModelEvent> {
    yield { response: resp("still looking", [stuckCall]), type: "done" };
  }
} as unknown as ModelProvider;

function streamingStuckRunner(opts: { compactionOccurred?: boolean; maxToolCalls?: number; ran: number[] }): ModelLoopRunner {
  return {
    ...(opts.compactionOccurred !== undefined ? { compactionOccurred: opts.compactionOccurred } : {}),
    maxToolCalls: opts.maxToolCalls ?? 20,
    metrics: { recordTokenUsage() {} },
    tracer: { startSpan: () => noopSpan },
    executeToolCall: stuckExecuteToolCall(opts.ran)
  } as unknown as ModelLoopRunner;
}

describe("post-compaction loop guard wiring (executeModelLoop)", () => {
  it("armed by compactionOccurred: aborts once the identical call repeats the guard window", async () => {
    const ran: number[] = [];
    const result = await executeModelLoop(
      blockingStuckRunner({ compactionOccurred: true, ran }),
      context(),
      {} as unknown as ModelProvider,
      request()
    );
    // The exact-signature deduplicator serves turns 2+ from cache — only the
    // FIRST turn genuinely executes — yet the guard still trips on turn 3.
    expect(ran.length).toBe(1);
    expect(result.finalResponse.id).toBe("post-compaction-loop-guard");
    expect(result.finalResponse.output).toContain("post-compaction loop detected");
    expect(result.finalResponse.output).toContain(POST_COMPACTION_GUARD_WINDOW.toString());
  });

  it("NOT armed (no compaction this run): the identical-repeat scenario is unaffected by this guard", async () => {
    const ran: number[] = [];
    const result = await executeModelLoop(
      blockingStuckRunner({ maxToolCalls: 5, ran }),
      context(),
      {} as unknown as ModelProvider,
      request()
    );
    // No compactionOccurred flag → guard stays unarmed → never aborts via this
    // guard; the run proceeds until the ordinary maxToolCalls budget cuts it.
    expect(result.finalResponse.id).not.toBe("post-compaction-loop-guard");
    expect(ran.length).toBe(1);
  });
});

describe("post-compaction loop guard wiring (executeStreamingModelLoop)", () => {
  async function drain(runner: ModelLoopRunner) {
    const gen = executeStreamingModelLoop(runner, context(), stuckStreamProvider, request(), { forwardTextDeltas: false });
    let next = await gen.next();
    while (!next.done) next = await gen.next();
    return next.value;
  }

  it("armed by compactionOccurred: aborts identically on the streaming path", async () => {
    const ran: number[] = [];
    const execution = await drain(streamingStuckRunner({ compactionOccurred: true, ran }));
    expect(ran.length).toBe(1);
    expect(execution.finalResponse.id).toBe("post-compaction-loop-guard");
  });
});
