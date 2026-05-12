/**
 * `muse proactive` — operator tools for the proactive surfacing
 * daemon (see `docs/design/proactive-surfacing.md`).
 *
 *   muse proactive test   — send a one-line test message to
 *                            MUSE_PROACTIVE_PROVIDER/DESTINATION so
 *                            the operator can verify the channel
 *                            without waiting on a real imminent event.
 *   muse proactive scan   — dry-run scan of the calendar + tasks
 *                            sources within the lead window; prints
 *                            what would fire next tick but does not
 *                            push and does not touch the sidecar.
 *
 * The daemon itself stays in apps/api; these commands only need the
 * messaging / calendar / tasks file resolution that
 * `@muse/autoconfigure` already exposes.
 */

import type { Command } from "commander";

import {
  buildCalendarRegistry,
  buildMessagingRegistry,
  resolveProactiveHistoryFile,
  resolveTasksFile
} from "@muse/autoconfigure";
import type { CalendarEvent } from "@muse/calendar";
import { readProactiveHistory } from "@muse/mcp";

import type { ProgramIO } from "./program.js";

export interface ProactiveHelpers {
  /** Test seam — defaults to `process.env`. */
  readonly env?: () => NodeJS.ProcessEnv;
}

export function registerProactiveCommands(program: Command, io: ProgramIO, helpers: ProactiveHelpers = {}): void {
  const env = () => helpers.env?.() ?? process.env;

  const proactive = program
    .command("proactive")
    .description("Proactive surfacing utilities (test / scan against MUSE_PROACTIVE_* env)");

  proactive
    .command("test")
    .description("Send a one-line test message to MUSE_PROACTIVE_PROVIDER/DESTINATION to verify the channel")
    .option("--text <message>", "Override the test message", "⏰ Muse proactive test — channel is working.")
    .action(async (options: { readonly text: string }, command) => {
      const e = env();
      const provider = e.MUSE_PROACTIVE_PROVIDER?.trim();
      const destination = e.MUSE_PROACTIVE_DESTINATION?.trim();
      if (!provider || provider.length === 0 || !destination || destination.length === 0) {
        io.stderr("MUSE_PROACTIVE_PROVIDER and MUSE_PROACTIVE_DESTINATION must be set.\n");
        command.error("Missing proactive config", { exitCode: 1 });
        return;
      }
      const registry = buildMessagingRegistry(e);
      if (!registry.has(provider)) {
        io.stderr(
          `messaging provider '${provider}' is not registered — set the relevant token ` +
            `(e.g. MUSE_TELEGRAM_BOT_TOKEN / MUSE_DISCORD_BOT_TOKEN / MUSE_SLACK_BOT_TOKEN / MUSE_LINE_CHANNEL_ACCESS_TOKEN).\n`
        );
        command.error("Provider not registered", { exitCode: 1 });
        return;
      }
      try {
        await registry.send(provider, { destination, text: options.text });
        io.stdout(`Sent test message via ${provider} → ${destination}\n`);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        io.stderr(`Failed: ${message}\n`);
        command.error("Send failed", { exitCode: 1 });
      }
    });

  proactive
    .command("scan")
    .description("Dry-run scan of imminent calendar events + due-soon tasks — prints what would fire next tick")
    .option("--lead-minutes <minutes>", "Override MUSE_PROACTIVE_LEAD_MINUTES for this scan (default 10)")
    .action(async (options: { readonly leadMinutes?: string }, _command) => {
      const e = env();
      const leadMinutes = options.leadMinutes
        ? Math.max(1, Number.parseInt(options.leadMinutes, 10) || 10)
        : Number.parseInt(e.MUSE_PROACTIVE_LEAD_MINUTES?.trim() ?? "10", 10) || 10;
      const now = new Date();
      const cutoff = new Date(now.getTime() + leadMinutes * 60_000);

      const calendarRegistry = buildCalendarRegistry(e);
      const tasksFile = resolveTasksFile(e);

      const lines: string[] = [];
      lines.push(`Window: ${now.toISOString()} → ${cutoff.toISOString()} (${leadMinutes.toString()} min)`);

      try {
        const events = calendarRegistry.list().length > 0
          ? await calendarRegistry.listEvents({ from: now, to: cutoff })
          : [];
        const imminent = events.filter((event: CalendarEvent) => !event.allDay && event.startsAt >= now && event.startsAt <= cutoff);
        if (imminent.length === 0) {
          lines.push("Calendar: (no imminent events)");
        } else {
          lines.push(`Calendar: ${imminent.length.toString()} imminent event(s)`);
          for (const event of imminent) {
            const minutesAway = Math.round((event.startsAt.getTime() - now.getTime()) / 60_000);
            lines.push(`  · ${event.title} in ${minutesAway.toString()} min${event.location ? ` (${event.location})` : ""}`);
          }
        }
      } catch (cause) {
        lines.push(`Calendar: ERROR ${cause instanceof Error ? cause.message : String(cause)}`);
      }

      try {
        const { readTasks } = await import("@muse/mcp");
        const tasks = await readTasks(tasksFile);
        const dueSoon = tasks.filter((task) => {
          if (task.status !== "open" || !task.dueAt || task.proactive === false) return false;
          const due = new Date(task.dueAt);
          return !Number.isNaN(due.getTime()) && due >= now && due <= cutoff;
        });
        if (dueSoon.length === 0) {
          lines.push("Tasks: (no due-soon tasks)");
        } else {
          lines.push(`Tasks: ${dueSoon.length.toString()} due-soon task(s)`);
          for (const task of dueSoon) {
            const minutesAway = Math.round((new Date(task.dueAt!).getTime() - now.getTime()) / 60_000);
            lines.push(`  · ${task.title} due in ${minutesAway.toString()} min`);
          }
        }
      } catch (cause) {
        lines.push(`Tasks: ERROR ${cause instanceof Error ? cause.message : String(cause)}`);
      }

      io.stdout(`${lines.join("\n")}\n`);
    });

  proactive
    .command("history")
    .description("Audit recent proactive notices from ~/.muse/proactive-history.json")
    .option("--limit <count>", "Max entries (newest first, default 20, cap 500)", "20")
    .option("--json", "Print the raw entries as JSON")
    .action(async (options: { readonly limit?: string; readonly json?: boolean }) => {
      const e = env();
      const file = resolveProactiveHistoryFile(e);
      const limit = Math.max(1, Math.min(500, Number.parseInt(options.limit ?? "20", 10) || 20));
      const entries = await readProactiveHistory(file, limit);
      if (options.json) {
        io.stdout(`${JSON.stringify({ entries, total: entries.length }, null, 2)}\n`);
        return;
      }
      if (entries.length === 0) {
        io.stdout(`No proactive history yet (${file})\n`);
        return;
      }
      io.stdout(`${entries.length.toString()} entry/entries (newest first):\n`);
      for (const entry of entries) {
        const flag = entry.status === "delivered" ? "✓" : "✗";
        const head = `${flag} [${entry.firedAtIso}] ${entry.kind}:${entry.itemId.slice(0, 12)} via ${entry.providerId}`;
        io.stdout(`${head}\n  ${entry.title} — ${entry.text}\n`);
        if (entry.status === "failed" && entry.error) {
          io.stdout(`  ! ${entry.error}\n`);
        }
      }
    });
}
