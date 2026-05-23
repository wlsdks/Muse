import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { findJobsByIdPrefix } from "./commands-jobs.js";
import { registerOpenCommand } from "./commands-open.js";
import type { ProgramIO } from "./program.js";

function seedJob(dir: string, id: string, events: readonly Record<string, unknown>[]): void {
  writeFileSync(join(dir, `${id}.jsonl`), events.map((e) => JSON.stringify(e)).join("\n"), "utf8");
}

describe("muse open — scans the objectives store (it claims 'every store')", () => {
  const prev = process.env.MUSE_OBJECTIVES_FILE;
  afterEach(() => {
    if (prev === undefined) delete process.env.MUSE_OBJECTIVES_FILE;
    else process.env.MUSE_OBJECTIVES_FILE = prev;
  });

  it("resolves an obj_<id> prefix to the standing objective record", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-open-obj-"));
    const file = join(dir, "objectives.json");
    writeFileSync(file, `${JSON.stringify({ objectives: [
      { id: "obj_abcdef123456", userId: "local", createdAt: "2026-05-12T00:00:00Z", spec: "watch the build until green", kind: "until", status: "active" }
    ] })}\n`, "utf8");
    process.env.MUSE_OBJECTIVES_FILE = file;
    // Point the other stores at the same dir's (absent) files so they read empty.
    process.env.MUSE_REMINDERS_FILE = join(dir, "reminders.json");
    process.env.MUSE_FOLLOWUPS_FILE = join(dir, "followups.json");
    process.env.MUSE_TASKS_FILE = join(dir, "tasks.json");

    const stdout: string[] = [];
    const io = { stderr: () => {}, stdout: (m: string) => stdout.push(m) } as unknown as ProgramIO;
    const program = new Command();
    program.exitOverride();
    registerOpenCommand(program, io);
    await program.parseAsync(["node", "muse", "open", "obj_abcdef", "--json"], { from: "node" });

    const parsed = JSON.parse(stdout.join("")) as { kind?: string; record?: { id?: string; spec?: string } };
    expect(parsed.kind).toBe("objective");
    expect(parsed.record?.id).toBe("obj_abcdef123456");
    expect(parsed.record?.spec).toBe("watch the build until green");
  });
});

describe("findJobsByIdPrefix — the jobs store, reachable by id prefix", () => {
  const prev = process.env.MUSE_JOBS_DIR;
  afterEach(() => {
    if (prev === undefined) delete process.env.MUSE_JOBS_DIR;
    else process.env.MUSE_JOBS_DIR = prev;
  });

  it("returns the matching job with a summary record (status + prompt), ignoring non-matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-open-jobs-"));
    process.env.MUSE_JOBS_DIR = dir;
    seedJob(dir, "job_2026-05-24T01-00-00_abcdef12", [
      { type: "started", tsIso: "2026-05-24T01:00:00Z", prompt: "summarise my week" },
      { type: "done", tsIso: "2026-05-24T01:02:00Z" }
    ]);
    seedJob(dir, "job_2026-05-24T09-00-00_99999999", [
      { type: "started", tsIso: "2026-05-24T09:00:00Z", prompt: "other job" }
    ]);

    const hits = await findJobsByIdPrefix("job_2026-05-24T01");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe("job_2026-05-24T01-00-00_abcdef12");
    expect(hits[0]!.record["status"]).toBe("done");
    expect(hits[0]!.record["prompt"]).toBe("summarise my week");
  });

  it("returns [] when the jobs dir does not exist", async () => {
    process.env.MUSE_JOBS_DIR = join(tmpdir(), "muse-open-jobs-absent-xyz");
    expect(await findJobsByIdPrefix("job_")).toEqual([]);
  });
});

describe("muse open — scans the jobs store (it claims 'every store')", () => {
  const prevJobs = process.env.MUSE_JOBS_DIR;
  afterEach(() => {
    if (prevJobs === undefined) delete process.env.MUSE_JOBS_DIR;
    else process.env.MUSE_JOBS_DIR = prevJobs;
  });

  it("resolves a job_<id> prefix to the background-job record", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-open-jobopen-"));
    process.env.MUSE_JOBS_DIR = dir;
    seedJob(dir, "job_2026-05-24T02-30-00_deadbeef", [
      { type: "started", tsIso: "2026-05-24T02:30:00Z", prompt: "draft release notes" },
      { type: "done", tsIso: "2026-05-24T02:31:00Z" }
    ]);
    // Point the other stores at absent files so nothing else can match.
    for (const [k, name] of [
      ["MUSE_REMINDERS_FILE", "reminders.json"], ["MUSE_FOLLOWUPS_FILE", "followups.json"],
      ["MUSE_OBJECTIVES_FILE", "objectives.json"], ["MUSE_TASKS_FILE", "tasks.json"],
      ["MUSE_EPISODES_FILE", "episodes.json"], ["MUSE_PATTERNS_FIRED_FILE", "patterns-fired.json"],
      ["MUSE_PROACTIVE_HISTORY_FILE", "proactive-history.json"]
    ] as const) {
      process.env[k] = join(dir, name);
    }

    const stdout: string[] = [];
    const io = { stderr: () => {}, stdout: (m: string) => stdout.push(m) } as unknown as ProgramIO;
    const program = new Command();
    program.exitOverride();
    registerOpenCommand(program, io);
    await program.parseAsync(["node", "muse", "open", "job_2026-05-24T02", "--json"], { from: "node" });

    const parsed = JSON.parse(stdout.join("")) as { kind?: string; record?: { status?: string; prompt?: string } };
    expect(parsed.kind).toBe("job");
    expect(parsed.record?.status).toBe("done");
    expect(parsed.record?.prompt).toBe("draft release notes");
  });
});
