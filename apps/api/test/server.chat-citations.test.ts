import { describe, expect, it } from "vitest";
import { createAgentRuntime } from "@muse/agent-core";
import type { ModelProvider, ModelResponse, WebSearchCitation } from "@muse/model";
import { buildServer } from "../src/server.js";

describe("/api/chat citations", () => {
  it("returns citations[] in the response body (empty when diagnostic provider returns none)", async () => {
    const agentRuntime = createAgentRuntime({
      modelProvider: createProvider("Diagnostic response", [])
    });
    const server = buildServer({
      agentRuntime,
      defaultModel: "provider/model",
      logger: false
    });

    const response = await server.inject({
      headers: { "content-type": "application/json" },
      method: "POST",
      payload: { message: "search query" },
      url: "/api/chat"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().citations).toBeInstanceOf(Array);
    expect(response.json().citations).toHaveLength(0);
  });

  it("returns citations[] populated when the provider returns citation items", async () => {
    const citation: WebSearchCitation = {
      title: "Example result",
      url: "https://example.com/result"
    };
    const agentRuntime = createAgentRuntime({
      modelProvider: createProvider("Answer with sources", [citation])
    });
    const server = buildServer({
      agentRuntime,
      defaultModel: "provider/model",
      logger: false
    });

    const response = await server.inject({
      headers: { "content-type": "application/json" },
      method: "POST",
      payload: { message: "search query with citations" },
      url: "/api/chat"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().citations).toEqual([citation]);
    expect(response.json().content).toBe("Answer with sources");
  });

  it("accepts metadata.tools.web_search override without rejecting the request", async () => {
    let capturedMetadata: unknown;
    const modelProvider: ModelProvider = {
      id: "test",
      async generate(request) {
        capturedMetadata = request.metadata;
        return { id: "r1", model: request.model, output: "ok" };
      },
      async listModels() { return []; },
      async *stream(request) {
        const r = await this.generate(request);
        yield { text: r.output, type: "text-delta" as const };
        yield { response: r, type: "done" as const };
      }
    };
    const agentRuntime = createAgentRuntime({ modelProvider });
    const server = buildServer({
      agentRuntime,
      defaultModel: "provider/model",
      logger: false
    });

    const response = await server.inject({
      headers: { "content-type": "application/json" },
      method: "POST",
      payload: {
        message: "test",
        metadata: { tools: { web_search: true } }
      },
      url: "/api/chat"
    });

    expect(response.statusCode).toBe(200);
    // webSearchPolicy is injected into metadata by buildModelRequestWithWebSearch
    expect(capturedMetadata).toMatchObject({ webSearchPolicy: expect.any(Object) });
  });

  it("emits citations SSE event in stream when provider yields citations", async () => {
    const citation: WebSearchCitation = {
      title: "Stream result",
      url: "https://example.com/stream"
    };
    const modelProvider: ModelProvider = {
      id: "test",
      async generate(request) {
        return { id: "r1", model: request.model, output: "streamed answer" };
      },
      async listModels() { return []; },
      async *stream(request) {
        yield { text: "streamed answer", type: "text-delta" as const };
        yield { items: [citation], type: "citations" as const };
        yield {
          response: { citations: [citation], id: "r1", model: request.model, output: "streamed answer" },
          type: "done" as const
        };
      }
    };
    const agentRuntime = createAgentRuntime({ modelProvider });
    const server = buildServer({
      agentRuntime,
      defaultModel: "provider/model",
      logger: false
    });

    const response = await server.inject({
      headers: { "content-type": "application/json" },
      method: "POST",
      payload: { message: "search" },
      url: "/api/chat/stream"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: citations");
    expect(response.body).toContain("example.com/stream");
  });
});

function createProvider(output: string, citations: WebSearchCitation[]): ModelProvider {
  return {
    id: "test",
    async generate(request): Promise<ModelResponse> {
      return {
        citations: citations.length > 0 ? citations : undefined,
        id: "response-1",
        model: request.model,
        output
      };
    },
    async listModels() { return []; },
    async *stream(request) {
      const response = await this.generate(request);
      yield { text: response.output, type: "text-delta" as const };
      yield { response, type: "done" as const };
    }
  };
}
