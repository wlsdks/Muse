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

  // Delete a single run by id, or bulk via --before <iso>.
  runs
    .command("delete")
    .description("Delete one or more agent runs from history (goal 057)")
    .argument("[run-id]", "Run ID to delete; omit when using --before")
    .option("--before <iso>", "Bulk-delete every run whose startedAt is at or before this ISO timestamp")
    .action(async (runId: string | undefined, options: { readonly before?: string }, command: Command) => {
      if (!runId && !options.before) {
        io.stderr("muse runs delete: pass <run-id> or --before <iso>\n");
        process.exitCode = 1;
        return;
      }
      if (runId && options.before) {
        io.stderr("muse runs delete: pass either <run-id> or --before, not both\n");
        process.exitCode = 1;
        return;
      }
      const path = options.before
        ? `/api/admin/runs?before=${encodeURIComponent(options.before)}`
        : `/api/admin/runs/${encodeURIComponent(runId!)}`;
      helpers.writeOutput(io, await helpers.apiRequest(io, command, path, undefined, "DELETE"));
    });
}
