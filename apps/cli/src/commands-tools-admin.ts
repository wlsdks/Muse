/**
 * `muse tools` command group. Wraps the tool-usage observability
 * surfaces: `/api/admin/tools/stats`, `/api/admin/tools/accuracy`,
 * `/api/admin/tool-calls`, `/api/admin/tool-calls/ranking`.
 */

import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

export interface ToolsAdminCommandHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST" | "PUT" | "DELETE"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerToolsAdminCommands(program: Command, io: ProgramIO, helpers: ToolsAdminCommandHelpers): void {
  const tools = program.command("tools").description("Inspect tool usage stats, accuracy, and recent calls");

  tools
    .command("stats")
    .description("Aggregate tool call counts across the lookback window")
    .action(async (_options, command: Command) => {
      helpers.writeOutput(io, await helpers.apiRequest(io, command, "/api/admin/tools/stats"));
    });

  tools
    .command("accuracy")
    .description("Per-tool success / failure ratios")
    .action(async (_options, command: Command) => {
      helpers.writeOutput(io, await helpers.apiRequest(io, command, "/api/admin/tools/accuracy"));
    });

  tools
    .command("calls")
    .description("Recent individual tool calls")
    .action(async (_options, command: Command) => {
      helpers.writeOutput(io, await helpers.apiRequest(io, command, "/api/admin/tool-calls"));
    });

  tools
    .command("ranking")
    .description("Tool call frequency ranking")
    .action(async (_options, command: Command) => {
      helpers.writeOutput(io, await helpers.apiRequest(io, command, "/api/admin/tool-calls/ranking"));
    });
}
