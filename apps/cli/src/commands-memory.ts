/**
 * `muse memory` command group.
 *
 * Wraps the personal user-memory CRUD on `/api/user-memory/me`:
 *
 *   - `muse memory show` — GET, prints facts / preferences / recent topics
 *   - `muse memory set <kind> <key> <value>` — PUT a fact or preference
 *     (kind = "fact" | "preference")
 *   - `muse memory clear` — DELETE the user-memory record
 *
 * Single-user product: there's no `--user` flag — the CLI always
 * targets the canonical `me` userId. Multi-tenant residue from the
 * Reactor migration.
 *
 * Output is human-readable by default; `--json` opts into the raw
 * API response.
 */

import type { Command } from "commander";

import { formatMemoryShow } from "./human-formatters.js";
import type { ProgramIO } from "./program.js";

const MEMORY_USER_ID = "me";
const MEMORY_BASE_PATH = `/api/user-memory/${MEMORY_USER_ID}`;

export interface MemoryCommandHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST" | "PUT" | "DELETE"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerMemoryCommands(program: Command, io: ProgramIO, helpers: MemoryCommandHelpers): void {
  const memory = program.command("memory").description("Personal user-memory facts / preferences");

  memory
    .command("show")
    .description("Print stored facts, preferences, and recent topics")
    .option("--json", "Print the raw API response instead of the formatted summary")
    .action(async (options: { readonly json?: boolean }, command) => {
      const result = await helpers.apiRequest(io, command, MEMORY_BASE_PATH);
      if (options.json) {
        helpers.writeOutput(io, result);
        return;
      }
      const merged = { userId: MEMORY_USER_ID, ...((result as Record<string, unknown>) ?? {}) };
      io.stdout(formatMemoryShow(merged as unknown as Parameters<typeof formatMemoryShow>[0]));
    });

  memory
    .command("set")
    .description("Store a fact or preference key/value entry")
    .argument("<kind>", "Entry kind: 'fact' or 'preference'")
    .argument("<key>", "Memory key (e.g. timezone)")
    .argument("<value>", "Memory value")
    .option("--json", "Print the raw API response instead of a short confirmation")
    .action(async (
      kind: string,
      key: string,
      value: string,
      options: { readonly json?: boolean },
      command
    ) => {
      const segment = parseKindSegment(kind);
      const result = await helpers.apiRequest(io, command, `${MEMORY_BASE_PATH}/${segment}`, { key, value }, "PUT");
      if (options.json) {
        helpers.writeOutput(io, result);
        return;
      }
      io.stdout(`Set ${segment.slice(0, -1)} ${key} = ${value}\n`);
    });

  memory
    .command("clear")
    .description("Wipe stored user memory")
    .action(async (_options, command) => {
      await helpers.apiRequest(io, command, MEMORY_BASE_PATH, undefined, "DELETE");
      io.stdout("Cleared user memory\n");
    });
}

function parseKindSegment(kind: string): "facts" | "preferences" {
  const trimmed = kind.trim().toLowerCase();
  if (trimmed === "fact" || trimmed === "facts") {
    return "facts";
  }
  if (trimmed === "preference" || trimmed === "preferences") {
    return "preferences";
  }
  throw new Error("kind must be 'fact' or 'preference'");
}
