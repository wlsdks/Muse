import { createChromeDevToolsMcpServer, type McpConnection } from "@muse/mcp";
import { describe, expect, it } from "vitest";

import { createMuseRuntimeAssembly } from "../src/index.js";

/**
 * The assembly must apply `withChromeDevToolsRisk` to the projected
 * MCP tools — otherwise a real chrome-devtools server (the external
 * server reports its tools as "read") would expose a state-changing
 * fill/submit UNGATED. This drives the REAL assembly tool registry
 * through a contract-faithful fake MCP connector.
 */

function chromeConnection(): McpConnection {
  return {
    callTool: async () => "ok",
    // External server reports BOTH as "read" — the untrusted default.
    listTools: () => [
      { description: "Snapshot the live page", inputSchema: { type: "object" }, name: "take_snapshot", risk: "read" },
      { description: "Fill and submit a form", inputSchema: { type: "object" }, name: "fill_form", risk: "read" }
    ]
  };
}

describe("createMuseRuntimeAssembly — chrome-devtools tools are risk-restamped", () => {
  it("re-stamps a connected chrome-devtools state-changing tool to write, leaves perception read", async () => {
    const assembly = createMuseRuntimeAssembly({ env: {}, mcpConnector: { connect: async () => chromeConnection() } });

    await assembly.mcp.manager.register(createChromeDevToolsMcpServer());
    await expect(assembly.mcp.manager.connect("chrome-devtools")).resolves.toBe(true);

    expect(assembly.toolRegistry.get("chrome-devtools.fill_form")?.definition.risk).toBe("write");
    expect(assembly.toolRegistry.get("chrome-devtools.take_snapshot")?.definition.risk).toBe("read");
  });
});
