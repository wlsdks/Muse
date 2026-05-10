/**
 * `muse memory` command group.
 *
 * Wraps the personal-user-memory CRUD on `/api/user-memory/:userId`:
 *
 *   - `muse memory show` — GET, prints facts / preferences / recent topics
 *   - `muse memory set <kind> <key> <value>` — PUT a fact or preference
 *     (kind = "fact" | "preference")
 *   - `muse memory clear` — DELETE the user-memory record
 *
 * Output is human-readable by default; `--json` opts into the raw
 * API response. In personal-use mode (auth disabled) the server
 * accepts any non-`anonymous` userId, so the CLI defaults to `me`
 * and a `--user <userId>` flag can override when running with auth.
 */

import type { Command } from "commander";

import { formatMemoryShow } from "./human-formatters.js";
import type { ProgramIO } from "./program.js";

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
    .option("--user <userId>", "User id to read (default: me)", "me")
    .option("--json", "Print the raw API response instead of the formatted summary")
    .action(async (options: { readonly user: string; readonly json?: boolean }, command) => {
      const path = `/api/user-memory/${encodeURIComponent(options.user)}`;
      const result = await helpers.apiRequest(io, command, path);
      if (options.json) {
        helpers.writeOutput(io, result);
        return;
      }
      const merged = { userId: options.user, ...((result as Record<string, unknown>) ?? {}) };
      io.stdout(formatMemoryShow(merged as unknown as Parameters<typeof formatMemoryShow>[0]));
    });

  memory
    .command("set")
    .description("Store a fact or preference key/value entry")
    .argument("<kind>", "Entry kind: 'fact' or 'preference'")
    .argument("<key>", "Memory key (e.g. timezone)")
    .argument("<value>", "Memory value")
    .option("--user <userId>", "User id to write (default: me)", "me")
    .option("--json", "Print the raw API response instead of a short confirmation")
    .action(async (
      kind: string,
      key: string,
      value: string,
      options: { readonly user: string; readonly json?: boolean },
      command
    ) => {
      const segment = parseKindSegment(kind);
      const path = `/api/user-memory/${encodeURIComponent(options.user)}/${segment}`;
      const result = await helpers.apiRequest(io, command, path, { key, value }, "PUT");
      if (options.json) {
        helpers.writeOutput(io, result);
        return;
      }
      io.stdout(`Set ${segment.slice(0, -1)} ${key} = ${value}\n`);
    });

  memory
    .command("clear")
    .description("Wipe stored memory for this user")
    .option("--user <userId>", "User id to clear (default: me)", "me")
    .action(async (options: { readonly user: string }, command) => {
      const path = `/api/user-memory/${encodeURIComponent(options.user)}`;
      await helpers.apiRequest(io, command, path, undefined, "DELETE");
      io.stdout(`Cleared user memory for ${options.user}\n`);
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
