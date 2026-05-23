import { describe, expect, it } from "vitest";

import { createMcpMuseTool, type McpConnection } from "../src/index.js";

const conn: McpConnection = { callTool: async () => "ok", listTools: () => [] };

describe("createMcpMuseTool — keyword projection", () => {
  it("forwards a tool's keywords to MuseToolDefinition.keywords", () => {
    const tool = createMcpMuseTool("muse.calendar", {
      description: "free/busy",
      domain: "calendar",
      keywords: ["free", "busy", "availability"],
      name: "availability",
      risk: "read"
    }, conn);
    expect(tool.definition.keywords).toEqual(["free", "busy", "availability"]);
    expect(tool.definition.domain).toBe("calendar");
  });

  it("omits keywords when none are declared (no empty array on the definition)", () => {
    const tool = createMcpMuseTool("muse.x", { description: "d", name: "t", risk: "read" }, conn);
    expect(tool.definition.keywords).toBeUndefined();
  });
});
