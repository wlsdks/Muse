import { validateToolDefinitions, type MuseTool } from "@muse/tools";
import { describe, expect, it } from "vitest";

import { createCalendarMcpServer } from "../src/index.js";

// Only the tool DEFINITIONS are inspected here — the registry is never
// called — so a typed stub is enough to build the server.
const stubRegistry = {
  createEvent: async () => ({}),
  deleteEvent: async () => undefined,
  listEvents: async () => [],
  updateEvent: async () => ({})
} as unknown as Parameters<typeof createCalendarMcpServer>[0]["registry"];

describe("calendar loopback tools meet the one-shot tool-calling bar", () => {
  it("every event tool (list/add/update/delete) describes ALL its parameters", () => {
    const server = createCalendarMcpServer({ registry: stubRegistry });
    const asMuseTools: MuseTool[] = server.tools.map((tool) => ({
      definition: {
        description: tool.description,
        inputSchema: tool.inputSchema ?? { type: "object" },
        name: tool.name,
        risk: tool.risk ?? "read"
      },
      execute: async () => "unused"
    }));

    const issues = validateToolDefinitions(asMuseTools);
    expect(issues.filter((i) => i.code === "undescribed_parameter")).toEqual([]);
    // Sanity: the write tools the model fills the most are present.
    const names = server.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["add", "update", "delete"]));
  });

  it("the 'add' tool's title + startsAtIso carry concrete, example-bearing descriptions", () => {
    const server = createCalendarMcpServer({ registry: stubRegistry });
    const add = server.tools.find((t) => t.name === "add")!;
    const props = (add.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(props.title.description ?? "").toContain("e.g.");
    expect(props.startsAtIso.description ?? "").toMatch(/tomorrow 3pm|ISO/u);
  });
});
