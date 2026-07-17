import { describe, expect, it } from "vitest";

import { readRiskToolOptions, toolsForServer, uniqueServerNames } from "./flow-tool-catalog.js";

import type { LoopbackCatalogResponse } from "../api/types.js";

const CATALOG: LoopbackCatalogResponse = {
  servers: [
    {
      description: "Built-in clock and date utilities (loopback MCP).",
      name: "muse.time",
      optIn: false,
      tools: [
        { description: "Returns the current ISO timestamp.", name: "now", risk: "read" },
        { description: "Duration in ms between two ISO timestamps.", name: "diff_ms", risk: "read" }
      ]
    },
    {
      description: "Contacts store.",
      name: "muse.contacts",
      optIn: false,
      tools: [
        { description: "Look up a contact.", name: "find", risk: "read" },
        { description: "Create a contact.", name: "create", risk: "write" }
      ]
    },
    {
      description: "Filesystem access.",
      name: "muse.fs",
      optIn: true,
      tools: [
        { description: "Delete a file.", name: "delete", risk: "execute" },
        { description: "A tool with no declared risk.", name: "mystery" }
      ]
    }
  ],
  total: 3
};

describe("readRiskToolOptions — fail-closed read-only picker filter", () => {
  it("keeps only risk: 'read' tools, dropping write/execute AND unrisked tools", () => {
    const options = readRiskToolOptions(CATALOG);
    expect(options).toEqual([
      { serverDescription: "Built-in clock and date utilities (loopback MCP).", serverName: "muse.time", toolDescription: "Returns the current ISO timestamp.", toolName: "now" },
      { serverDescription: "Built-in clock and date utilities (loopback MCP).", serverName: "muse.time", toolDescription: "Duration in ms between two ISO timestamps.", toolName: "diff_ms" },
      { serverDescription: "Contacts store.", serverName: "muse.contacts", toolDescription: "Look up a contact.", toolName: "find" }
    ]);
  });

  it("MUTATION-RED: a write tool must never appear in the read-only picker", () => {
    const options = readRiskToolOptions(CATALOG);
    expect(options.some((option) => option.toolName === "create")).toBe(false);
    expect(options.some((option) => option.toolName === "delete")).toBe(false);
    expect(options.some((option) => option.toolName === "mystery")).toBe(false);
  });

  it("an empty catalog yields an empty option list", () => {
    expect(readRiskToolOptions({ servers: [], total: 0 })).toEqual([]);
  });
});

describe("uniqueServerNames / toolsForServer — cascading select derivation", () => {
  it("uniqueServerNames returns each server exactly once, in first-seen order", () => {
    const options = readRiskToolOptions(CATALOG);
    expect(uniqueServerNames(options)).toEqual(["muse.time", "muse.contacts"]);
  });

  it("toolsForServer scopes to the chosen server's read tools only", () => {
    const options = readRiskToolOptions(CATALOG);
    const timeTools = toolsForServer(options, "muse.time");
    expect(timeTools.map((tool) => tool.toolName)).toEqual(["now", "diff_ms"]);
    const contactsTools = toolsForServer(options, "muse.contacts");
    expect(contactsTools.map((tool) => tool.toolName)).toEqual(["find"]);
  });

  it("toolsForServer returns an empty list for a server not present among read tools", () => {
    const options = readRiskToolOptions(CATALOG);
    expect(toolsForServer(options, "muse.fs")).toEqual([]);
  });
});
