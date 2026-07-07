/**
 * Production wiring for `muse mcp serve` — connects the 3 read-only tools
 * (`mcp-serve-tools.ts`) to a real `StdioServerTransport` and runs until
 * stdin closes. All logging goes to stderr; stdout carries ONLY the MCP
 * JSON-RPC wire protocol.
 */

import { createMuseToolsMcpServer, runStdioMcpServer } from "@muse/mcp";

import { buildMcpServeTools, resolveMcpServeDependencies } from "./mcp-serve-tools.js";
import { MUSE_CLI_VERSION } from "./muse-version.js";
import type { ProgramIO } from "./program.js";

const MCP_SERVE_INSTRUCTIONS =
  "Muse's own read-only tools: muse_recall (cited grounded Q&A over the user's notes), " +
  "knowledge_search (deterministic ranked search over the user's notes + remembered facts/preferences), " +
  "and user_model_read (the user's facts/preferences with confidence). Everything runs locally; nothing " +
  "leaves this machine, and nothing here writes or changes anything.";

export async function runMcpServeCommand(io: ProgramIO): Promise<void> {
  const deps = resolveMcpServeDependencies(process.env as Record<string, string | undefined>);
  const tools = buildMcpServeTools(deps);
  const server = createMuseToolsMcpServer({
    instructions: MCP_SERVE_INSTRUCTIONS,
    serverName: "muse",
    serverVersion: MUSE_CLI_VERSION,
    tools
  });
  server.onerror = (error: Error) => {
    io.stderr(`muse mcp serve: ${error.message}\n`);
  };

  await runStdioMcpServer(server, () => {
    io.stderr(`muse mcp serve: listening on stdio (${tools.length.toString()} tools) — Ctrl-D or client disconnect to stop\n`);
  });
}
