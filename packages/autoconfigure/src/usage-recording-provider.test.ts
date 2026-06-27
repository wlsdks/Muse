import { USAGE_RECORDED_BY_RUNTIME_FLAG, type ModelEvent, type ModelProvider, type ModelRequest, type ModelResponse } from "@muse/model";
import type { TokenUsageRecord } from "@muse/observability";
import { describe, expect, it } from "vitest";

import { createUsageRecordingProvider } from "./usage-recording-provider.js";

const response: ModelResponse = {
  model: "gemma4:12b",
  output: "Paris",
  usage: { inputTokens: 100, outputTokens: 5, reasoningTokens: 2 }
} as ModelResponse;

function fakeProvider(): ModelProvider {
  return {
    id: "ollama",
    listModels: async () => [],
    generate: async () => response,
    stream: (async function* () {
      yield { text: "Paris", type: "text-delta" } as ModelEvent;
      yield { response, type: "done" } as ModelEvent;
    }) as unknown as ModelProvider["stream"]
  };
}

function recordingSink(): { records: TokenUsageRecord[]; record: (e: TokenUsageRecord) => Promise<void> } {
  const records: TokenUsageRecord[] = [];
  return { record: async (e) => { records.push(e); }, records };
}

const req = (metadata?: ModelRequest["metadata"]): ModelRequest => ({ messages: [], model: "gemma4:12b", ...(metadata ? { metadata } : {}) });

describe("createUsageRecordingProvider — captures the direct-call usage the runtime path misses", () => {
  it("records usage on generate (prompt/completion/reasoning summed)", async () => {
    const sink = recordingSink();
    await createUsageRecordingProvider(fakeProvider(), sink).generate(req());
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ promptTokens: 100, completionTokens: 5, reasoningTokens: 2, totalTokens: 107, runId: "cli.local", model: "gemma4:12b" });
  });

  it("records usage on a stream's `done` event", async () => {
    const sink = recordingSink();
    const events: string[] = [];
    for await (const ev of createUsageRecordingProvider(fakeProvider(), sink).stream(req())) events.push(ev.type);
    expect(events).toEqual(["text-delta", "done"]); // stream still yields through
    expect(sink.records).toHaveLength(1);
  });

  it("SKIPS a request the runtime already flagged (no double-count with recordTokenUsageEvent)", async () => {
    const sink = recordingSink();
    const provider = createUsageRecordingProvider(fakeProvider(), sink);
    await provider.generate(req({ [USAGE_RECORDED_BY_RUNTIME_FLAG]: true }));
    for await (const _ev of provider.stream(req({ [USAGE_RECORDED_BY_RUNTIME_FLAG]: true }))) { /* drain */ }
    expect(sink.records).toHaveLength(0);
  });

  it("uses request.metadata.runId when present (per-run attribution)", async () => {
    const sink = recordingSink();
    await createUsageRecordingProvider(fakeProvider(), sink).generate(req({ runId: "run-42" }));
    expect(sink.records[0]!.runId).toBe("run-42");
  });

  it("a sink write failure never breaks the call (best-effort telemetry)", async () => {
    const provider = createUsageRecordingProvider(fakeProvider(), { record: async () => { throw new Error("disk full"); } });
    await expect(provider.generate(req())).resolves.toMatchObject({ output: "Paris" });
  });
});
