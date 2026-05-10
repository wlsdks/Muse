/**
 * `muse calendar` command group — read-only slice of `/api/calendar/*`.
 *
 *   - `muse calendar providers` — list configured calendar providers.
 *   - `muse calendar events [--from <iso>] [--to <iso>] [--provider <id>]`
 *     — list events; defaults to now → +30 days, all providers.
 *
 * Output is human-readable by default; `--json` opts into the raw API
 * response. `events add` (POST) is intentionally not exposed on the
 * CLI yet — for write workflows the user can ask the agent.
 */

import type { Command } from "commander";

import { formatCalendarEvents, formatProvidersList } from "./human-formatters.js";
import type { ProgramIO } from "./program.js";

export interface CalendarCommandHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST" | "PUT" | "DELETE"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerCalendarCommands(program: Command, io: ProgramIO, helpers: CalendarCommandHelpers): void {
  const calendar = program.command("calendar").description("Personal calendar (read-only CLI surface)");

  calendar
    .command("providers")
    .description("List configured calendar providers")
    .option("--json", "Print the raw API response instead of the formatted list")
    .action(async (options: { readonly json?: boolean }, command) => {
      const result = await helpers.apiRequest(io, command, "/api/calendar/providers");
      if (options.json) {
        helpers.writeOutput(io, result);
        return;
      }
      const providers = (result as { providers?: Parameters<typeof formatProvidersList>[1] })?.providers ?? [];
      io.stdout(formatProvidersList("Calendar providers", providers));
    });

  calendar
    .command("events")
    .description("List events between --from and --to (defaults: now → +30 days)")
    .option("--from <iso>", "ISO 8601 start (default: now)")
    .option("--to <iso>", "ISO 8601 end (default: now + 30 days)")
    .option("--provider <id>", "Specific provider id (default: all)")
    .option("--json", "Print the raw API response instead of the day-grouped agenda")
    .action(async (
      options: { readonly from?: string; readonly to?: string; readonly provider?: string; readonly json?: boolean },
      command
    ) => {
      const params = new URLSearchParams();
      if (options.from) {
        params.set("fromIso", options.from);
      }
      if (options.to) {
        params.set("toIso", options.to);
      }
      if (options.provider) {
        params.set("providerId", options.provider);
      }
      const query = params.toString();
      const path = query.length > 0 ? `/api/calendar/events?${query}` : "/api/calendar/events";
      const result = await helpers.apiRequest(io, command, path);
      if (options.json) {
        helpers.writeOutput(io, result);
        return;
      }
      io.stdout(formatCalendarEvents(result as unknown as Parameters<typeof formatCalendarEvents>[0]));
    });
}
