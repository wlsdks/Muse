/**
 * `muse scheduler` and `muse setup` command groups, extracted from
 * apps/cli/src/program.ts.
 *
 * Both groups are self-contained: they only consume `apiRequest` /
 * `writeOutput` helpers (passed in as dependencies) and the
 * `runCalendarSetup` wizard. Pulling them out of program.ts keeps the
 * top-level command file focused on the cross-cutting plumbing
 * (config / auth / chat / TUI).
 */

import type { Command } from "commander";

import { runCalendarSetup } from "./setup-calendar.js";
import type { ProgramIO } from "./program.js";

export interface SchedulerSetupHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerSchedulerCommands(program: Command, io: ProgramIO, helpers: SchedulerSetupHelpers): void {
  const { apiRequest, writeOutput } = helpers;
  const scheduler = program.command("scheduler").description("Manage scheduled jobs");

  scheduler
    .command("list")
    .description("List scheduled jobs")
    .action(async (_options, command) => {
      writeOutput(io, await apiRequest(io, command, "/api/scheduler/jobs"));
    });

  scheduler
    .command("create-agent")
    .description("Create an agent scheduled job")
    .argument("<name>", "Job name")
    .argument("<cron>", "Cron expression")
    .argument("<prompt...>", "Agent prompt")
    .option("--model <model>", "Agent model")
    .option("--disabled", "Create disabled")
    .action(async (name: string, cronExpression: string, promptParts: readonly string[], options: { readonly model?: string; readonly disabled?: boolean }, command) => {
      writeOutput(io, await apiRequest(io, command, "/api/scheduler/jobs", {
        agentModel: options.model,
        agentPrompt: promptParts.join(" "),
        cronExpression,
        enabled: !options.disabled,
        jobType: "agent",
        name
      }));
    });

  scheduler
    .command("trigger")
    .description("Trigger a scheduled job")
    .argument("<job-id>", "Job ID")
    .action(async (jobId: string, _options, command) => {
      writeOutput(
        io,
        await apiRequest(io, command, `/api/scheduler/jobs/${encodeURIComponent(jobId)}/trigger`, undefined, "POST")
      );
    });

  scheduler
    .command("dry-run")
    .description("Dry-run a scheduled job")
    .argument("<job-id>", "Job ID")
    .action(async (jobId: string, _options, command) => {
      writeOutput(
        io,
        await apiRequest(io, command, `/api/scheduler/jobs/${encodeURIComponent(jobId)}/dry-run`, undefined, "POST")
      );
    });
}

export function registerSetupCommands(program: Command, io: ProgramIO): void {
  const setup = program.command("setup").description("Run interactive setup wizards");

  setup
    .command("calendar")
    .description("Configure calendar providers (local / google / caldav / macos) and store credentials")
    .action(async () => {
      await runCalendarSetup({ stderr: io.stderr, stdout: io.stdout });
    });
}
