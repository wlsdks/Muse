/**
 * `muse runs` command group. Wraps `/api/admin/runs` (list) and
 * `/api/admin/runs/:runId` (detail) so the CLI can inspect agent
 * run history without opening the web UI.
 */

import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

export interface RunsCommandHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST" | "PUT" | "DELETE"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerRunsCommands(program: Command, io: ProgramIO, helpers: RunsCommandHelpers): void {
  const runs = program.command("runs").description("Inspect recent agent run history");

  runs
    .command("list")
    .description("List recent agent runs (newest first)")
    .option("--limit <n>", "Max runs to return (default 20, max 1000)")
    .action(async (options: { readonly limit?: string }, command: Command) => {
      const path = options.limit ? `/api/admin/runs?limit=${encodeURIComponent(options.limit)}` : "/api/admin/runs";
      helpers.writeOutput(io, await helpers.apiRequest(io, command, path));
    });

  runs
    .command("show")
    .description("Show a single run with its messages and tool calls")
    .argument("<run-id>", "Run ID")
    .action(async (runId: string, _options, command: Command) => {
      helpers.writeOutput(
        io,
        await helpers.apiRequest(io, command, `/api/admin/runs/${encodeURIComponent(runId)}`)
      );
    });
}
