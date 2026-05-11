import { describe, expect, it } from "vitest";

import openaiFixture from "../__fixtures__/web-search/openai-responses.json" with { type: "json" };

import {
  fromOpenAIResponsesResponse,
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
