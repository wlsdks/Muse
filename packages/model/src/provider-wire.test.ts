import { describe, expect, it } from "vitest";

import openaiFixture from "../__fixtures__/web-search/openai-responses.json" with { type: "json" };

import {
  fromOpenAIResponsesResponse,
  parseOpenAIResponsesStream,
  toOpenAIResponsesRequest
} from "./provider-wire.js";

describe("toOpenAIResponsesRequest", () => {
  const base = {
    model: "openai/gpt-4o",
    messages: [
      { role: "user" as const, content: "hello" }
    ]
  };

  it("emits a Responses-shaped payload with model + input + tools", () => {
    const out = toOpenAIResponsesRequest(base, "gpt-4o", { enabled: false, maxUses: 5 });
    expect(out.model).toBe("gpt-4o");
    expect(Array.isArray(out.input)).toBe(true);
    expect(out.input[0]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "hello" }]
    });
    expect(out.tools ?? []).toEqual([]);
  });

  it("injects { type:'web_search' } when policy enabled", () => {
    const out = toOpenAIResponsesRequest(base, "gpt-4o", { enabled: true, maxUses: 5 });
    expect(out.tools).toEqual([{ type: "web_search" }]);
  });

  it("preserves caller-supplied function tools alongside web_search", () => {
    const request = {
      ...base,
      tools: [{ name: "get_time", description: "", inputSchema: { type: "object" }, risk: "read" as const }]
    };
    const out = toOpenAIResponsesRequest(request, "gpt-4o", { enabled: true, maxUses: 5 });
    expect(out.tools).toEqual([
      { type: "function", function: { name: "get_time", description: "", parameters: { type: "object" } } },
      { type: "web_search" }
    ]);
  });
});

describe("fromOpenAIResponsesResponse", () => {
  it("extracts output text and citations from annotations", () => {
    const r = fromOpenAIResponsesResponse("openai", "gpt-4o", openaiFixture);
    expect(r.output).toContain("Reports today highlight");
    expect(r.citations).toHaveLength(2);
    expect(r.citations?.[0]).toMatchObject({
      url: "https://example.com/news/a",
      title: "Example News A"
    });
    expect(r.usage?.inputTokens).toBe(12);
    expect(r.usage?.outputTokens).toBe(34);
  });

  it("returns empty citations array when no annotations are present", () => {
    const payload = {
      id: "x",
      model: "gpt-4o",
      output: [{ type: "message", id: "m1", role: "assistant", content: [{ type: "output_text", text: "hi", annotations: [] }] }]
    };
    const r = fromOpenAIResponsesResponse("openai", "gpt-4o", payload);
    expect(r.citations).toEqual([]);
  });
});

describe("parseOpenAIResponsesStream", () => {
  function asStream(lines: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(enc.encode(line));
        controller.close();
      }
    });
  }

  it("emits text-delta, tool-call-started/finished, citations, done", async () => {
    const sse = [
      "data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"web_search_call\",\"id\":\"ws1\"}}\n\n",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello \"}\n\n",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"world\"}\n\n",
      "data: {\"type\":\"response.output_item.done\",\"item\":{\"type\":\"web_search_call\",\"id\":\"ws1\"}}\n\n",
      "data: {\"type\":\"response.output_text.annotation.added\",\"annotation\":{\"type\":\"url_citation\",\"url\":\"https://x.test\",\"title\":\"X\"}}\n\n",
      "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"r1\",\"model\":\"gpt-4o\",\"usage\":{\"input_tokens\":1,\"output_tokens\":2,\"total_tokens\":3}}}\n\n",
      "data: [DONE]\n\n"
    ];
    const events: unknown[] = [];
    for await (const ev of parseOpenAIResponsesStream("openai", "gpt-4o", asStream(sse))) {
      events.push(ev);
    }
    const types = events.map((e) => (e as { type: string }).type);
    expect(types).toContain("tool-call-started");
    expect(types).toContain("tool-call-finished");
    expect(types).toContain("citations");
    expect(types).toContain("text-delta");
    expect(types).toContain("done");
  });
});
