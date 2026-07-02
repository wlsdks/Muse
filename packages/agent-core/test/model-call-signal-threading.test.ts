import type { ModelProvider, ModelRequest } from "@muse/model";
import { describe, expect, it } from "vitest";

import { createAgentRuntime } from "../src/index.js";

// The run-level AbortSignal used to be checked only BETWEEN loop steps; the
// runtime now threads it into the ModelRequest so adapters can abort the
// in-flight HTTP call itself.

function captureProvider(sink: { request?: ModelRequest }): ModelProvider {
  return {
    id: "capture",
    async generate(request) { sink.request = request; return { id: "r", model: request.model, output: "ok" }; },
    async listModels() { return []; },
    async *stream(request) {
      sink.request = request;
      yield { text: "ok", type: "text-delta" };
      yield { response: { id: "r", model: request.model, output: "ok" }, type: "done" };
    }
  };
}

describe("run-level AbortSignal reaches the model request", () => {
  it("run(): input.signal is threaded into the provider's ModelRequest", async () => {
    const sink: { request?: ModelRequest } = {};
    const controller = new AbortController();
    await createAgentRuntime({ modelProvider: captureProvider(sink) }).run({
      messages: [{ content: "hi", role: "user" }],
      model: "capture/model",
      runId: "sig-run",
      signal: controller.signal
    });
    expect(sink.request?.signal).toBe(controller.signal);
  });

  it("stream(): same threading on the streaming path", async () => {
    const sink: { request?: ModelRequest } = {};
    const controller = new AbortController();
    const events = createAgentRuntime({ modelProvider: captureProvider(sink) }).stream({
      messages: [{ content: "hi", role: "user" }],
      model: "capture/model",
      runId: "sig-stream",
      signal: controller.signal
    });
    for await (const _event of events) { /* drain */ }
    expect(sink.request?.signal).toBe(controller.signal);
  });

  it("no input.signal → no signal field fabricated on the request", async () => {
    const sink: { request?: ModelRequest } = {};
    await createAgentRuntime({ modelProvider: captureProvider(sink) }).run({
      messages: [{ content: "hi", role: "user" }],
      model: "capture/model",
      runId: "sig-none"
    });
    expect(sink.request?.signal).toBeUndefined();
  });
});
