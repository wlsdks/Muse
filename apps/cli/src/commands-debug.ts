/**
 * `muse debug` command group. Currently wraps the replay-capture
 * surfaces under /api/admin/debug/replay; future debug-only commands
 * can pile on without expanding the top-level CLI namespace.
 */

import type { Command } from "commander";

import { parseBoundedInt } from "./commands-ask.js";
import type { ProgramIO } from "./program.js";

export interface DebugCommandHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST" | "PUT" | "DELETE"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerDebugCommands(program: Command, io: ProgramIO, helpers: DebugCommandHelpers): void {
  const debug = program.command("debug").description("Debugging surfaces (replay captures of failed runs)");

  debug
    .command("replay")
    .description("List recent failed-run replay captures")
    .option("--limit <n>", "Max captures to return (default 50, max 1000)")
    .action(async (options: { readonly limit?: string }, command: Command) => {
      const limit = options.limit === undefined ? undefined : parseBoundedInt(options.limit, "--limit", 1, 1000, 50);
      const path = limit !== undefined
        ? `/api/admin/debug/replay?limit=${limit.toString()}`
        : "/api/admin/debug/replay";
      helpers.writeOutput(io, await helpers.apiRequest(io, command, path));
    });

  debug
    .command("replay-show")
    .description("Fetch a single replay capture by id")
    .argument("<id>", "Replay capture id (matches the failed run id)")
    .action(async (id: string, _options, command: Command) => {
      helpers.writeOutput(
        io,
        await helpers.apiRequest(io, command, `/api/admin/debug/replay/${encodeURIComponent(id)}`)
      );
    });

  debug
    .command("context")
    .description("Show the exact messages + tool calls the LLM saw on a given run")
    .argument("<runId>", "Agent run id (from `muse runs list`)")
    .option("--json", "Emit the full JSON envelope instead of the rendered transcript")
    .action(async (
      runId: string,
      options: { readonly json?: boolean },
      command: Command
    ) => {
      const detail = (await helpers.apiRequest(
        io,
        command,
        `/api/admin/runs/${encodeURIComponent(runId)}`
      )) as RunDetailEnvelope;
      if (options.json) {
        helpers.writeOutput(io, detail);
        return;
      }
      io.stdout(formatRunContext(runId, detail));
    });
}

interface RunDetailEnvelope {
  readonly run?: {
    readonly id?: string;
    readonly status?: string;
    readonly model?: string;
    readonly error?: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
  };
  readonly messages?: readonly RunMessage[];
  readonly toolCalls?: readonly RunToolCall[];
}

interface RunMessage {
  readonly role?: string;
  readonly content?: string;
  readonly createdAt?: string;
}

interface RunToolCall {
  readonly id?: string;
  readonly name?: string;
  readonly arguments?: unknown;
  readonly result?: unknown;
  readonly error?: string;
}

function formatRunContext(runId: string, detail: RunDetailEnvelope): string {
  const lines: string[] = [];
  const run = detail.run;
  lines.push(`Run ${runId}`);
  if (run) {
    if (run.status) lines.push(`  status: ${run.status}`);
    if (run.model) lines.push(`  model: ${run.model}`);
    if (run.startedAt) lines.push(`  started: ${run.startedAt}`);
    if (run.completedAt) lines.push(`  completed: ${run.completedAt}`);
    if (run.error) lines.push(`  error: ${run.error}`);
  }
  const messages = detail.messages ?? [];
  lines.push("");
  lines.push(`Messages (${messages.length.toString()}):`);
  for (const m of messages) {
    const role = m.role ?? "?";
    const stamp = m.createdAt ? ` @${m.createdAt}` : "";
    lines.push(`  --- [${role}]${stamp} ---`);
    const content = m.content ?? "";
    for (const line of content.split("\n")) {
      lines.push(`    ${line}`);
    }
  }
  const toolCalls = detail.toolCalls ?? [];
  if (toolCalls.length > 0) {
    lines.push("");
    lines.push(`Tool calls (${toolCalls.length.toString()}):`);
    for (const t of toolCalls) {
      const id = t.id ?? "?";
      lines.push(`  [${id}] ${t.name ?? "?"}`);
      lines.push(`    args: ${truncateJson(t.arguments)}`);
      if (t.error) {
        lines.push(`    error: ${t.error}`);
      } else {
        lines.push(`    result: ${truncateJson(t.result)}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function truncateJson(value: unknown, max = 800): string {
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s === undefined) return "undefined";
  return s.length > max ? `${s.slice(0, max)}… (+${(s.length - max).toString()} chars)` : s;
}
