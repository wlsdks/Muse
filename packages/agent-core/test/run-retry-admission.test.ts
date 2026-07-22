import { InMemoryResponseCache } from "@muse/cache";
import { fetchWithRetry } from "@muse/mcp-shared";
import type { ModelProvider, ModelRequest, ModelResponse } from "@muse/model";
import { ModelProviderError } from "@muse/model";
import { InMemoryMuseTracer } from "@muse/observability";
import { createToolExposureAuthority } from "@muse/policy";
import { retry } from "@muse/resilience";
import { createRunToolPlanTool, ToolRegistry, type MuseTool } from "@muse/tools";
import { describe, expect, it } from "vitest";

import { createAgentRuntime, type AgentRuntimeStreamEvent } from "../src/index.js";

const RETRY_KEYS = [
  "retry.budget.max_backoff_ms",
  "retry.budget.max_retries",
  "retry.budget.used_backoff_ms",
  "retry.budget.used_retries"
] as const;

function sequenceProvider(turns: readonly ModelResponse[]): ModelProvider {
  let index = 0;
  return {
    id: "sequence",
    async generate(request) {
      const turn = turns[Math.min(index, turns.length - 1)]!;
      index += 1;
      return { ...turn, model: request.model };
    },
    async listModels() { return []; },
    async *stream() {}
  };
}

function streamingProvider(turns: readonly ModelResponse[]): ModelProvider {
  let index = 0;
  return {
    id: "stream-sequence",
    async generate() { throw new Error("blocking generation is unexpected"); },
    async listModels() { return []; },
    async *stream(request: ModelRequest) {
      const turn = turns[Math.min(index, turns.length - 1)]!;
      index += 1;
      for (const toolCall of turn.toolCalls ?? []) yield { toolCall, type: "tool-call" };
      if (turn.output.length > 0) yield { text: turn.output, type: "text-delta" };
      yield { response: { ...turn, model: request.model }, type: "done" };
    }
  } as ModelProvider;
}

function retryingReadTool(name: string, state: { attempts: number }): MuseTool {
  return {
    definition: { description: `Retrying ${name}`, inputSchema: { type: "object" }, name, risk: "read" },
    execute: () => retry(
      () => {
        state.attempts += 1;
        if (state.attempts === 1) throw new Error("transient tool dependency");
        return Promise.resolve("tool-ok");
      },
      { initialDelayMs: 2, maxAttempts: 2, maxDelayMs: 2, sleep: async () => {} }
    )
  };
}

function retryingHttpReadTool(name: string, state: { attempts: number }): MuseTool {
  return {
    definition: { description: `HTTP retrying ${name}`, inputSchema: { type: "object" }, name, risk: "read" },
    execute: async () => {
      const response = await fetchWithRetry(
        (async () => {
          state.attempts += 1;
          return new Response(state.attempts === 1 ? "busy" : "tool-ok", {
            status: state.attempts === 1 ? 503 : 200
          });
        }) as typeof globalThis.fetch,
        "https://example.test/registered-read-tool",
        { baseDelayMs: 3, retries: 1, sleep: async () => {} }
      );
      return response.text();
    }
  };
}

const toolTurn = (name: string): ModelResponse => ({
  id: "tool-turn",
  model: "m",
  output: "",
  toolCalls: [{ arguments: {}, id: "call-1", name }]
});
const finalTurn: ModelResponse = { id: "final", model: "m", output: "done" };

function retryAttributes(tracer: InMemoryMuseTracer, spanName: "muse.agent.run" | "muse.agent.stream", index = -1) {
  const spans = tracer.recordedSpans().filter((span) => span.name === spanName);
  const span = index < 0 ? spans.at(index) : spans[index];
  expect(span?.endedAt).toBeInstanceOf(Date);
  expect(Object.keys(span?.attributes ?? {}).filter((key) => key.startsWith("retry.budget.")).sort()).toEqual([...RETRY_KEYS].sort());
  return span?.attributes;
}

async function collect(events: AsyncIterable<AgentRuntimeStreamEvent>): Promise<readonly AgentRuntimeStreamEvent[]> {
  const collected: AgentRuntimeStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe("foreground run retry admission", () => {
  it("passes one run ledger through an ordinary blocking tool call", async () => {
    const state = { attempts: 0 };
    const tracer = new InMemoryMuseTracer();
    const runtime = createAgentRuntime({
      modelProvider: sequenceProvider([toolTurn("read_once"), finalTurn]),
      runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 },
      toolRegistry: new ToolRegistry([retryingReadTool("read_once", state)]),
      tracer
    });

    await runtime.run({ messages: [{ content: "read", role: "user" }], model: "sequence/m" });

    expect(state.attempts).toBe(2);
    expect(retryAttributes(tracer, "muse.agent.run")).toMatchObject({
      "retry.budget.max_backoff_ms": 10,
      "retry.budget.max_retries": 1,
      "retry.budget.used_backoff_ms": 2,
      "retry.budget.used_retries": 1
    });
  });

  it("charges an actual registered read tool's HTTP retry to the run ledger", async () => {
    const state = { attempts: 0 };
    const tracer = new InMemoryMuseTracer();
    const runtime = createAgentRuntime({
      modelProvider: sequenceProvider([toolTurn("http_read"), finalTurn]),
      runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 },
      toolRegistry: new ToolRegistry([retryingHttpReadTool("http_read", state)]),
      tracer
    });

    await runtime.run({ messages: [{ content: "read over HTTP", role: "user" }], model: "sequence/m" });

    expect(state.attempts).toBe(2);
    expect(retryAttributes(tracer, "muse.agent.run")).toMatchObject({
      "retry.budget.used_backoff_ms": 3,
      "retry.budget.used_retries": 1
    });
  });

  it("isolates retry ledgers across concurrent AgentRuntime runs", async () => {
    const firstAttempts = { attempts: 0 };
    const secondAttempts = { attempts: 0 };
    const bothStarted = Promise.withResolvers<void>();
    let starts = 0;
    const makeConcurrentTool = (name: string, state: { attempts: number }): MuseTool => ({
      definition: { description: `Concurrent ${name}`, inputSchema: { type: "object" }, name, risk: "read" },
      execute: () => retry(async () => {
        state.attempts += 1;
        if (state.attempts === 1) {
          starts += 1;
          if (starts === 2) bothStarted.resolve();
          await bothStarted.promise;
          throw new Error("transient concurrent dependency");
        }
        return "tool-ok";
      }, { initialDelayMs: 2, maxAttempts: 2, maxDelayMs: 2, sleep: async () => {} })
    });
    const firstTracer = new InMemoryMuseTracer();
    const secondTracer = new InMemoryMuseTracer();
    const firstRuntime = createAgentRuntime({
      modelProvider: sequenceProvider([toolTurn("first_read"), finalTurn]),
      runRetryBudget: { maxBackoffMs: 2, maxRetries: 1 },
      toolRegistry: new ToolRegistry([makeConcurrentTool("first_read", firstAttempts)]),
      tracer: firstTracer
    });
    const secondRuntime = createAgentRuntime({
      modelProvider: sequenceProvider([toolTurn("second_read"), finalTurn]),
      runRetryBudget: { maxBackoffMs: 2, maxRetries: 1 },
      toolRegistry: new ToolRegistry([makeConcurrentTool("second_read", secondAttempts)]),
      tracer: secondTracer
    });

    await Promise.all([
      firstRuntime.run({ messages: [{ content: "first", role: "user" }], model: "sequence/m" }),
      secondRuntime.run({ messages: [{ content: "second", role: "user" }], model: "sequence/m" })
    ]);

    expect(firstAttempts.attempts).toBe(2);
    expect(secondAttempts.attempts).toBe(2);
    expect(retryAttributes(firstTracer, "muse.agent.run")).toMatchObject({
      "retry.budget.used_backoff_ms": 2,
      "retry.budget.used_retries": 1
    });
    expect(retryAttributes(secondTracer, "muse.agent.run")).toMatchObject({
      "retry.budget.used_backoff_ms": 2,
      "retry.budget.used_retries": 1
    });
  });

  it("passes the ledger through an ordinary streaming tool call", async () => {
    const state = { attempts: 0 };
    const tracer = new InMemoryMuseTracer();
    const runtime = createAgentRuntime({
      modelProvider: streamingProvider([toolTurn("stream_read"), finalTurn]),
      runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 },
      toolRegistry: new ToolRegistry([retryingReadTool("stream_read", state)]),
      tracer
    });

    const events = await collect(runtime.stream({ messages: [{ content: "read", role: "user" }], model: "stream-sequence/m" }));

    expect(events.at(-1)?.type).toBe("done");
    expect(state.attempts).toBe(2);
    expect(retryAttributes(tracer, "muse.agent.stream")).toMatchObject({
      "retry.budget.used_backoff_ms": 2,
      "retry.budget.used_retries": 1
    });
  });

  it("preserves the ledger through run_tool_plan nested steps", async () => {
    const state = { attempts: 0 };
    const tracer = new InMemoryMuseTracer();
    const planTurn: ModelResponse = {
      id: "plan",
      model: "m",
      output: "",
      toolCalls: [{
        arguments: { result: "$a", steps: [{ args: {}, as: "a", tool: "nested_read" }] },
        id: "plan-call",
        name: "run_tool_plan"
      }]
    };
    const runtime = createAgentRuntime({
      modelProvider: sequenceProvider([planTurn, finalTurn]),
      runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 },
      toolRegistry: new ToolRegistry([createRunToolPlanTool(), retryingReadTool("nested_read", state)]),
      tracer
    });

    await runtime.run({
      messages: [{ content: "plan the read", role: "user" }],
      model: "sequence/m",
      toolExposureAuthority: createToolExposureAuthority({ allowedToolNames: ["run_tool_plan", "nested_read"], localMode: true })
    });

    expect(state.attempts).toBe(2);
    expect(retryAttributes(tracer, "muse.agent.run")).toMatchObject({
      "retry.budget.used_backoff_ms": 2,
      "retry.budget.used_retries": 1
    });
  });

  it("records the exact four numeric attributes on failure", async () => {
    const tracer = new InMemoryMuseTracer();
    const provider: ModelProvider = {
      id: "permanent-failure",
      async generate() { throw new ModelProviderError("permanent-failure", "bad key", false); },
      async listModels() { return []; },
      async *stream() {}
    };
    const runtime = createAgentRuntime({ modelProvider: provider, runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 }, tracer });

    await expect(runtime.run({ messages: [{ content: "fail", role: "user" }], model: "permanent-failure/m" })).rejects.toThrow("bad key");

    expect(retryAttributes(tracer, "muse.agent.run")).toMatchObject({
      "retry.budget.max_backoff_ms": 10,
      "retry.budget.max_retries": 1,
      "retry.budget.used_backoff_ms": 0,
      "retry.budget.used_retries": 0
    });
  });

  it("records the exact four numeric attributes on streaming failure", async () => {
    const tracer = new InMemoryMuseTracer();
    const provider: ModelProvider = {
      id: "stream-failure",
      async generate() { throw new Error("blocking generation is unexpected"); },
      async listModels() { return []; },
      async *stream() {
        yield { text: "", type: "text-delta" };
        throw new ModelProviderError("stream-failure", "stream bad key", false);
      }
    };
    const runtime = createAgentRuntime({ modelProvider: provider, runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 }, tracer });

    await expect(collect(runtime.stream({ messages: [{ content: "fail", role: "user" }], model: "stream-failure/m" }))).rejects.toThrow("stream bad key");

    expect(retryAttributes(tracer, "muse.agent.stream")).toMatchObject({
      "retry.budget.max_backoff_ms": 10,
      "retry.budget.max_retries": 1,
      "retry.budget.used_backoff_ms": 0,
      "retry.budget.used_retries": 0
    });
  });

  it("records zeroed attributes on a cache-hit success", async () => {
    const tracer = new InMemoryMuseTracer();
    const runtime = createAgentRuntime({
      modelProvider: sequenceProvider([finalTurn]),
      responseCache: new InMemoryResponseCache(),
      runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 },
      tracer
    });
    const input = { messages: [{ content: "cache me", role: "user" as const }], model: "sequence/m" };
    await runtime.run(input);
    const second = await runtime.run(input);

    expect(second.fromCache).toBe(true);
    expect(retryAttributes(tracer, "muse.agent.run")).toMatchObject({
      "retry.budget.used_backoff_ms": 0,
      "retry.budget.used_retries": 0
    });
  });

  it("records zeroed attributes on a streaming cache-hit success", async () => {
    const tracer = new InMemoryMuseTracer();
    let streams = 0;
    const provider: ModelProvider = {
      id: "stream-cache",
      async generate() { throw new Error("blocking generation is unexpected"); },
      async listModels() { return []; },
      async *stream(request) {
        streams += 1;
        yield { response: { ...finalTurn, model: request.model }, type: "done" };
      }
    } as ModelProvider;
    const runtime = createAgentRuntime({
      modelProvider: provider,
      responseCache: new InMemoryResponseCache(),
      runRetryBudget: { maxBackoffMs: 10, maxRetries: 1 },
      tracer
    });
    const input = { messages: [{ content: "stream cache", role: "user" as const }], model: "stream-cache/m" };
    await collect(runtime.stream(input));
    await collect(runtime.stream(input));

    expect(streams).toBe(1);
    expect(retryAttributes(tracer, "muse.agent.stream")).toMatchObject({
      "retry.budget.used_backoff_ms": 0,
      "retry.budget.used_retries": 0
    });
  });
});
