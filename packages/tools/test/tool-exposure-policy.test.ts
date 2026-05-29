import { describe, expect, it } from "vitest";

import { createDefaultToolExposurePolicy, type MuseTool, type ToolExposureContext } from "../src/index.js";

const tool = (
  name: string,
  opts: { risk?: "read" | "write" | "execute"; scopes?: string[]; keywords?: string[] } = {},
): MuseTool => ({
  definition: {
    name,
    description: `${name} tool`,
    inputSchema: { type: "object" },
    risk: opts.risk ?? "read",
    ...(opts.scopes ? { scopes: opts.scopes } : {}),
    ...(opts.keywords ? { keywords: opts.keywords } : {}),
  },
  execute: () => "ok",
});

const select = (tools: MuseTool[], context: ToolExposureContext, options = {}) => {
  const result = createDefaultToolExposurePolicy(options).select(tools, context);
  return {
    tools: result.tools.map((t) => t.definition.name),
    blocked: result.blocked.map((b) => `${b.toolName}:${b.code}`),
  };
};

describe("DefaultToolExposurePolicy.select", () => {
  it("exposes a relevant read tool (empty prompt = relevant to everything)", () => {
    expect(select([tool("weather_get", { keywords: ["weather"] })], {})).toEqual({
      tools: ["weather_get"],
      blocked: [],
    });
  });

  it("blocks a tool outside a non-empty allowed set", () => {
    expect(select([tool("a"), tool("b")], { allowedToolNames: ["a"], prompt: "" })).toEqual({
      tools: ["a"],
      blocked: ["b:not_allowed"],
    });
  });

  it("blocks an explicitly forbidden tool", () => {
    expect(select([tool("a")], { forbiddenToolNames: ["a"], prompt: "" })).toEqual({
      tools: [],
      blocked: ["a:forbidden"],
    });
  });

  it("blocks a tool that hit the repeated-call limit (default 3, configurable)", () => {
    expect(select([tool("a")], { recentToolNames: ["a", "a", "a"], prompt: "" }).blocked).toEqual([
      "a:repeat_limit_exceeded",
    ]);
    expect(select([tool("a")], { recentToolNames: ["a"], prompt: "" }, { maxRepeatedToolCalls: 1 }).blocked).toEqual([
      "a:repeat_limit_exceeded",
    ]);
  });

  it("blocks execute/local tools unless localMode is on", () => {
    expect(select([tool("run", { risk: "execute" })], { prompt: "" }).blocked).toEqual([
      "run:local_execution_unavailable",
    ]);
    expect(select([tool("scoped", { scopes: ["local"] })], { prompt: "" }).blocked).toEqual([
      "scoped:local_execution_unavailable",
    ]);
    expect(select([tool("run", { risk: "execute" })], { prompt: "", localMode: true })).toEqual({
      tools: ["run"],
      blocked: [],
    });
  });

  it("blocks a write tool without a clear workspace-mutation prompt, allows it with one or with the override", () => {
    const write = [tool("edit_document", { risk: "write", keywords: ["edit", "document"] })];
    // "show me the document" is relevant (keyword "document") but NOT a
    // mutation prompt, so the write gate fires; the override lifts it.
    expect(select(write, { prompt: "show me the document" }).blocked).toEqual([
      "edit_document:write_without_mutation_intent",
    ]);
    expect(select(write, { prompt: "edit the document" })).toEqual({ tools: ["edit_document"], blocked: [] });
    expect(select(write, { prompt: "show me the document" }, { allowWriteWithoutMutationIntent: true })).toEqual({
      tools: ["edit_document"],
      blocked: [],
    });
  });

  it("blocks a tool irrelevant to the prompt", () => {
    expect(select([tool("weather", { keywords: ["weather"] })], { prompt: "tell me about databases" }).blocked).toEqual([
      "weather:irrelevant_to_prompt",
    ]);
  });

  it("caps the exposed set at maxTools and blocks the overflow", () => {
    expect(select([tool("a"), tool("b"), tool("c")], { prompt: "", maxTools: 2 })).toEqual({
      tools: ["a", "b"],
      blocked: ["c:max_tool_count_exceeded"],
    });
    expect(select([tool("a")], { prompt: "", maxTools: 0 }).blocked).toEqual(["a:max_tool_count_exceeded"]);
  });
});
