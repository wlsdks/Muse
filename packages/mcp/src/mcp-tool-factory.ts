import type { MuseTool } from "@muse/tools";

import { toErrorMessage } from "./error-utils.js";
import type { Awaitable, McpConnection, McpConnectionResolution, McpRemoteTool } from "./index.js";

export function createMcpMuseTool(
  serverName: string,
  tool: McpRemoteTool,
  connection: McpConnection,
  /**
   * Optional per-invocation resolver for the CURRENT live connection.
   * When supplied (the manager's `toMuseTools` path), execute re-resolves
   * the connection on every call — so a dead stdio server is retired and
   * reconnected transparently and this tool keeps working, instead of the
   * closure staying pinned to a connection object that died. When omitted
   * (loopback in-process tools that never lose their transport), execute
   * uses the captured `connection` unchanged.
   */
  resolveConnection?: () => Awaitable<McpConnectionResolution>
): MuseTool {
  return {
    definition: {
      description: tool.description,
      ...(tool.domain ? { domain: tool.domain } : {}),
      ...(tool.keywords && tool.keywords.length > 0 ? { keywords: tool.keywords } : {}),
      ...(tool.groundedArgs && tool.groundedArgs.length > 0 ? { groundedArgs: tool.groundedArgs } : {}),
      inputSchema: tool.inputSchema ?? {},
      name: `${serverName}.${tool.name}`,
      risk: tool.risk ?? "read"
    },
    execute: async (args) => {
      let activeConnection = connection;

      if (resolveConnection) {
        const resolved = await resolveConnection();
        if (resolved.error !== undefined) {
          // A dead, un-reconnectable server. Surface the compound
          // "disconnected: <reason>; reconnect failed: <reason2>" the
          // manager built — never the SDK's opaque "Not connected" —
          // and redact any secret the reason text may echo.
          return `Error: MCP tool '${tool.name}' failed: ${redactMcpSecrets(resolved.error)}`;
        }
        activeConnection = resolved.connection;
      }

      if (!activeConnection.callTool) {
        return `Error: MCP tool '${tool.name}' is not callable`;
      }

      try {
        return await activeConnection.callTool(tool.name, args);
      } catch (error) {
        // A mid-session callTool rejection (auth expired → 401, server
        // 500, request timeout, an SDK throw) MUST surface to the agent
        // as a clear, actionable error — never escape unhandled (which
        // would crash the tool loop on a non-ToolExecutor consumer) and
        // never be silently read as an empty/successful result (a
        // grounding hole: the model would report "no results" when the
        // call actually FAILED). Redact secrets first: the SDK's HTTP
        // error message can echo the request's `Authorization: Bearer
        // <token>` header, which must never reach the model or a log.
        return `Error: MCP tool '${tool.name}' failed: ${redactMcpSecrets(toErrorMessage(error))}`;
      }
    }
  };
}

function redactMcpSecrets(message: string): string {
  return message.replace(/Bearer\s+\S+/giu, "Bearer [redacted]");
}
