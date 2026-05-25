import { describe, expect, it } from "vitest";

import type { MuseTool } from "@muse/tools";

import { DynamicToolRegistry } from "../src/dynamic-tool-registry.js";

function tool(name: string, marker: string): MuseTool {
  return {
    definition: {
      name,
      description: `${name} tool`,
      inputSchema: { type: "object", properties: {}, required: [] },
      risk: "read"
    },
    execute: async () => ({ ok: marker })
  } as unknown as MuseTool;
}

// A dynamic MCP source can expose a tool whose name collides with a built-in
// (realistic on a multi-MCP machine). list() merged built-in + dynamic with
// no cross-dedup, so the name appeared TWICE in the projected tool list —
// and OpenAI/Anthropic reject duplicate function names. get() already
// resolved a collision to the built-in; list() must agree.
describe("DynamicToolRegistry — built-in vs dynamic name collisions", () => {
  it("never projects a duplicate tool name; the built-in wins (consistent with get())", () => {
    const registry = new DynamicToolRegistry([() => [tool("web_search", "DYNAMIC"), tool("only_dynamic", "DYN")]]);
    registry.register(tool("web_search", "BUILTIN"));
    registry.register(tool("home_state", "BUILTIN"));

    const names = registry.list().map((t) => t.definition.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates, "no duplicate tool name may reach the model").toEqual([]);

    // built-in wins the collision, matching get()
    expect(names).toContain("web_search");
    expect(registry.list().filter((t) => t.definition.name === "web_search")).toHaveLength(1);
  });

  it("keeps dynamic tools that do not collide with a built-in", () => {
    const registry = new DynamicToolRegistry([() => [tool("only_dynamic", "DYN")]]);
    registry.register(tool("home_state", "BUILTIN"));

    const names = registry.list().map((t) => t.definition.name).sort();
    expect(names).toEqual(["home_state", "only_dynamic"]);
  });

  it("planForContext does not expose a duplicate name either", () => {
    const registry = new DynamicToolRegistry([() => [tool("web_search", "DYNAMIC")]]);
    registry.register(tool("web_search", "BUILTIN"));

    const names = registry.planForContext({}).tools.map((t) => t.definition.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
