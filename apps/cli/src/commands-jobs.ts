/**
 * `muse job run/status/list/tail` — background long-running tasks.
 *
 * `muse job run --background <prompt>` spawns a detached worker that
 * runs the prompt through the local agent runtime, streaming progress
 * to `~/.muse/jobs/<id>.jsonl`. The parent returns immediately with
 * the job id. `muse job status <id>` (or `tail`) reads the file
 * back. `muse job list` shows recent jobs.
 *
 * Why this matters for JARVIS-class: real assistants take ownership of
 * multi-minute work — researching a topic, drafting a long doc, running
 * an analysis — and report back when done. Cron is wrong shape
 * (recurring, not one-shot). The agent runtime exists; this command
 * just wraps it in a fire-and-forget detached child + a status surface.
 *
 * Pure file IO + child_process.spawn. No daemon, no queue, no DB.
 * Open-source + zero recurring cost.
 */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as pathDirname, join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";

const here = pathDirname(fileURLToPath(import.meta.url));

import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

function jobsDir(): string {
  return process.env.MUSE_JOBS_DIR?.trim() ?? pathJoin(homedir(), ".muse", "jobs");
}

function jobPath(id: string): string {
  return pathJoin(jobsDir(), `${id}.jsonl`);
}

interface JobEvent {
  readonly type: "started" | "progress" | "result" | "error" | "done";
  readonly tsIso: string;
  readonly text?: string;
  readonly prompt?: string;
  readonly model?: string;
  readonly userKey?: string;
}

async function readJobLines(file: string): Promise<readonly JobEvent[]> {
  try {
    const raw = await readFile(file, "utf8");
    const out: JobEvent[] = [];
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      try {
        out.push(JSON.parse(line) as JobEvent);
      } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

function jobSummary(events: readonly JobEvent[]): {
  readonly status: "running" | "done" | "error" | "unknown";
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly prompt?: string;
  readonly finalText?: string;
  readonly error?: string;
} {
  let status: "running" | "done" | "error" | "unknown" = "unknown";
  let startedAt: string | undefined, finishedAt: string | undefined;
  let prompt: string | undefined, finalText = "", error: string | undefined;
  for (const ev of events) {
    if (ev.type === "started") {
      status = "running";
      startedAt = ev.tsIso;
      prompt = ev.prompt;
    } else if (ev.type === "progress") {
      finalText += ev.text ?? "";
    } else if (ev.type === "result") {
      finalText = ev.text ?? finalText;
    } else if (ev.type === "error") {
      status = "error";
      error = ev.text;
      finishedAt = ev.tsIso;
    } else if (ev.type === "done") {
      if (status !== "error") status = "done";
      finishedAt = ev.tsIso;
    }
  }
  return { error, finalText, finishedAt, prompt, startedAt, status };
}

export function registerJobCommands(program: Command, io: ProgramIO): void {
  const job = program.command("job").description("Background long-running agent tasks");

  job
    .command("run")
    .description("Run a prompt in the background; returns the job id immediately. Output streams to ~/.muse/jobs/<id>.jsonl")
    .argument("<prompt...>", "Free-text prompt")
    .option("--background", "Detach the worker. Default ON; pass --no-background to run inline.", true)
    .option("--model <tag>", "Model override")
    .option("--user <id>", "User identity (default $MUSE_USER_ID)")
    .option("--persona <slot>", "Persona slot")
    .option("--no-tools", "Run with the chat-only fast path (no tool registry)")
    .action(async (
      promptParts: readonly string[],
      options: {
        readonly background?: boolean;
        readonly model?: string;
        readonly user?: string;
        readonly persona?: string;
        readonly tools?: boolean;
      }
    ) => {
      const prompt = promptParts.join(" ").trim();
      if (prompt.length === 0) {
        io.stderr("usage: muse job run <prompt>\n");
        process.exitCode = 1;
        return;
      }
      const id = `job_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}_${randomUUID().slice(0, 8)}`;
      const dir = jobsDir();
      mkdirSync(dir, { recursive: true });
      const file = jobPath(id);

      const env = { ...process.env };
      const argv = [
        `--job-id=${id}`,
        `--job-file=${file}`,
        `--job-prompt=${prompt}`,
        ...(options.model ? [`--job-model=${options.model}`] : []),
        ...(options.user ? [`--job-user=${options.user}`] : []),
        ...(options.persona ? [`--job-persona=${options.persona}`] : []),
        ...(options.tools === false ? ["--job-no-tools"] : [])
      ];
      const workerPath = pathJoin(here, "job-worker.js");

      if (options.background === false) {
        // Inline mode — spawn but stream stdout/stderr through.
        const child = spawn(process.execPath, [workerPath, ...argv], { stdio: "inherit" });
        await new Promise<void>((resolve) => child.on("close", () => resolve()));
        io.stdout(`\nDone. Job log: ${file}\n`);
        return;
      }

      const child = spawn(process.execPath, [workerPath, ...argv], {
        detached: true,
        env,
        stdio: "ignore"
      });
      child.unref();
      io.stdout(`Started ${id}\n  log: ${file}\n  status: muse job status ${id}\n`);
    });

  job
    .command("status")
    .description("Show the latest snapshot of a job — running/done/error + final text so far")
    .argument("<id>", "Job id (from `muse job list` or the `run` output)")
    .option("--json", "Emit machine-readable JSON")
    .action(async (id: string, options: { readonly json?: boolean }) => {
      const file = jobPath(id);
      const events = await readJobLines(file);
      if (events.length === 0) {
        io.stderr(`Job '${id}' not found (no events in ${file})\n`);
        process.exitCode = 1;
        return;
      }
      const summary = jobSummary(events);
      if (options.json) {
        io.stdout(`${JSON.stringify({ events: events.length, file, id, ...summary }, null, 2)}\n`);
        return;
      }
      io.stdout(`Job ${id}: ${summary.status}\n`);
      if (summary.prompt) io.stdout(`  prompt: ${summary.prompt}\n`);
      if (summary.startedAt) io.stdout(`  started: ${summary.startedAt}\n`);
      if (summary.finishedAt) io.stdout(`  finished: ${summary.finishedAt}\n`);
      if (summary.error) io.stdout(`  error: ${summary.error}\n`);
      if (summary.finalText && summary.finalText.length > 0) {
        io.stdout(`  output:\n${summary.finalText.split("\n").map((l) => `    ${l}`).join("\n")}\n`);
      }
    });

  job
    .command("list")
    .description("Recent jobs (newest first)")
    .option("--limit <n>", "Max entries (default 20)", "20")
    .action(async (options: { readonly limit: string }) => {
      const dir = jobsDir();
      if (!existsSync(dir)) {
        io.stdout(`No jobs yet (dir ${dir} doesn't exist).\n`);
        return;
      }
      const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 20));
      const files = readdirSync(dir)
        .filter((name) => name.endsWith(".jsonl"))
        .sort()
        .reverse()
        .slice(0, limit);
      io.stdout(`${files.length.toString()} job(s) in ${dir}:\n`);
      for (const name of files) {
        const id = name.replace(/\.jsonl$/, "");
        const events = await readJobLines(pathJoin(dir, name));
        const summary = jobSummary(events);
        const flag = summary.status === "done" ? "✓" : summary.status === "error" ? "✗" : summary.status === "running" ? "…" : "?";
        const preview = (summary.prompt ?? "").slice(0, 60);
        io.stdout(`  ${flag} ${id}  ${preview}${(summary.prompt ?? "").length > 60 ? "…" : ""}\n`);
      }
    });

  job
    .command("tail")
    .description("Live-follow a job's progress events (tail -f equivalent)")
    .argument("<id>", "Job id")
    .action(async (id: string) => {
      const file = jobPath(id);
      io.stdout(`tailing ${file} (Ctrl-C to stop)\n\n`);
      let last = 0;
      const tick = async (): Promise<void> => {
        try {
          const raw = readFileSync(file, "utf8");
          if (raw.length > last) {
            io.stdout(raw.slice(last));
            last = raw.length;
          }
        } catch { /* not yet created */ }
      };
      const interval = setInterval(() => { void tick(); }, 500);
      process.on("SIGINT", () => { clearInterval(interval); process.exit(0); });
      await new Promise(() => { /* hold */ });
    });

  // job append helper exposed for the worker child process.
  // Re-exported via a tiny wrapper so the worker (in job-worker.ts)
  // can append events without re-importing the helper.
}

export async function appendJobEvent(file: string, event: JobEvent): Promise<void> {
  await appendFile(file, `${JSON.stringify({ ...event, tsIso: event.tsIso ?? new Date().toISOString() })}\n`, { mode: 0o600 });
}
