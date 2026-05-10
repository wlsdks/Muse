/**
 * `muse today` — personal-JARVIS morning briefing.
 *
 * Calls a single server-side endpoint:
 *
 *   GET /api/today?lookaheadHours=N
 *
 * Round 119 fanned out client-side to three separate routes; round
 * 123 added the consolidated server endpoint, and this iter (round
 * 124) replaces the fan-out with one fetch. Net: one round-trip
 * instead of three; the server owns sectioning + sorting; the CLI
 * is purely a renderer.
 *
 * Same DI injection pattern as the other CLI command modules.
 */

import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

interface TodayBriefing {
  readonly generatedAt: string;
  readonly lookaheadHours: number;
  readonly tasks?: readonly { readonly id: string; readonly title: string }[];
  readonly events?: readonly { readonly id: string; readonly title: string; readonly startsAtIso: string }[];
  readonly notes?: readonly string[];
}

export interface TodayCommandHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST" | "PUT" | "DELETE"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerTodayCommands(program: Command, io: ProgramIO, helpers: TodayCommandHelpers): void {
  program
    .command("today")
    .description("Personal morning briefing — open tasks, next 24h calendar, recent notes")
    .option("--json", "Print machine-readable JSON instead of the formatted summary")
    .option("--lookahead-hours <n>", "Hours of calendar look-ahead (default 24)")
    .action(async (options: { readonly json?: boolean; readonly lookaheadHours?: string }, command) => {
      const lookaheadParam = options.lookaheadHours
        ? `?lookaheadHours=${encodeURIComponent(options.lookaheadHours)}`
        : "";
      const briefing = (await helpers.apiRequest(io, command, `/api/today${lookaheadParam}`)) as TodayBriefing;

      if (options.json) {
        helpers.writeOutput(io, briefing);
        return;
      }

      io.stdout(`Today (${shortDateLabel(briefing.generatedAt)}, next ${briefing.lookaheadHours}h)\n`);
      io.stdout(formatTasks(briefing.tasks));
      io.stdout(formatEvents(briefing.events));
      io.stdout(formatNotes(briefing.notes));
    });
}

function shortDateLabel(generatedAt: string): string {
  return generatedAt.slice(0, 10);
}

function formatTasks(tasks: readonly { readonly id: string; readonly title: string }[] | undefined): string {
  if (!tasks) {
    return "\nTasks: (not configured)\n";
  }
  if (tasks.length === 0) {
    return "\nTasks: (none open)\n";
  }
  const lines = tasks.map((task) => `  - [${task.id.slice(0, 12)}] ${task.title}`);
  return `\nTasks (${tasks.length} open):\n${lines.join("\n")}\n`;
}

function formatEvents(events: readonly { readonly id: string; readonly title: string; readonly startsAtIso: string }[] | undefined): string {
  if (!events) {
    return "\nUpcoming: (calendar not configured)\n";
  }
  if (events.length === 0) {
    return "\nUpcoming: (no calendar events in window)\n";
  }
  const lines = events.map((event) => `  - ${event.startsAtIso.slice(11, 16)} — ${event.title}`);
  return `\nUpcoming (${events.length}):\n${lines.join("\n")}\n`;
}

function formatNotes(notes: readonly string[] | undefined): string {
  if (!notes) {
    return "\nRecent notes: (notes dir not configured)\n";
  }
  if (notes.length === 0) {
    return "\nRecent notes: (none)\n";
  }
  return `\nRecent notes:\n${notes.map((name) => `  - ${name}`).join("\n")}\n`;
}
