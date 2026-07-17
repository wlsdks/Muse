import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPersonalThread, linkArtifact, unlinkArtifact } from "@muse/attunement";
import { readTasks, writeTasks } from "@muse/stores";
import { FileProgressiveAutonomyOpportunityStore } from "@muse/stores/host-progressive-autonomy-opportunities";
import { afterEach, describe, expect, it } from "vitest";

import { createProgram, type ProgramIO } from "./program.js";
import { buildShadowReport } from "./commands-autonomy.js";

describe("muse autonomy trusted shadow CLI", () => {
  const dirs: string[] = [];
  const originalEnv = { ...process.env };

  afterEach(async () => {
    process.env = { ...originalEnv };
    process.exitCode = 0;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it("dedupes organic runtime logical identities and never counts 22 legacy manual receipts toward readiness", () => {
    const envelope = {
      action: "muse.tasks.complete-linked-next-step",
      idempotencyKey: "runtime-opportunity:run-1:task-next",
      link: { artifactType: "task", linkedAt: "2026-07-17T02:00:00.000Z", providerId: "local", role: "next-step", taskId: "task-next" },
      schemaVersion: 1,
      threadId: "thread-life",
      traceId: "runtime-tool:run-1:call-1",
      transition: { from: "open", to: "done" },
      userId: "dogfood-user"
    } as const;
    const manual = Array.from({ length: 22 }, (_, index) => ({
      enforcementDecision: "confirm" as const,
      envelope,
      executionId: `manual-${index.toString()}`,
      grantId: "grant-1",
      id: `receipt-${index.toString()}`,
      rationale: "explicit confirmation required",
      recordedAt: "2026-07-17T03:00:00.000Z",
      shadowAssessment: "wouldConfirm" as const,
      shadowRationale: "no exact active standing grant"
    }));
    const runtime = {
      enforcementDecision: "confirm" as const,
      envelope,
      id: "runtime-1",
      origin: "runtime-opportunity" as const,
      rationale: "explicit confirmation required",
      recordedAt: "2026-07-17T03:00:00.000Z",
      runId: "run-1",
      shadowAssessment: "wouldConfirm" as const,
      shadowRationale: "no exact active standing grant",
      toolCallId: "call-1"
    };

    const report = buildShadowReport(manual, [runtime, { ...runtime, id: "runtime-2", toolCallId: "call-2" }]);

    expect(report.sources.manualCli.observedDecisions).toBe(22);
    expect(report.sources.runtimeOpportunity.observedDecisions).toBe(1);
    expect(report.review).toMatchObject({ observedOrganicOpportunities: 1, status: "collecting" });
  });

  it("grants the exact open user-linked local next step through the public program", async () => {
    const fixture = await createFixture();
    const { errors, output } = await run(["grant-next-step", fixture.threadId, "--json"]);

    expect(errors).toEqual([]);
    expect(JSON.parse(output.join(""))).toMatchObject({
      action: "muse.tasks.complete-linked-next-step",
      link: { providerId: "local", role: "next-step", taskId: fixture.taskId },
      maxUses: 20,
      threadId: fixture.threadId,
      userId: "dogfood-user"
    });
    expect(await readTasks(fixture.tasksFile)).toMatchObject([{ id: fixture.taskId, status: "open" }]);
  });

  it("lists durable grants through stable JSON", async () => {
    const fixture = await createFixture();
    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };

    const listed = await run(["list", "--json"]);

    expect(listed.errors).toEqual([]);
    expect(JSON.parse(listed.output.join(""))).toEqual({
      grants: [{ grant: expect.objectContaining({ id: grant.id }), usedCount: 0 }],
      schemaVersion: 1
    });
  });

  it("revokes an exact grant through the trusted CLI invocation", async () => {
    const fixture = await createFixture();
    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };

    const revoked = await run(["revoke", grant.id, "--json"]);

    expect(revoked.errors).toEqual([]);
    expect(JSON.parse(revoked.output.join(""))).toMatchObject({
      grant: { id: grant.id },
      revokedAt: expect.any(String),
      usedCount: 0
    });
    const listed = await run(["list", "--json"]);
    expect(JSON.parse(listed.output.join(""))).toMatchObject({
      grants: [{ grant: { id: grant.id }, revokedAt: expect.any(String), usedCount: 0 }]
    });
    const taskBytes = await readFile(fixture.tasksFile, "utf8");
    const shadowed = await run(["shadow", grant.id, "--json"]);
    expect(JSON.parse(shadowed.output.join(""))).toMatchObject({ shadowAssessment: "wouldConfirm" });
    expect(await readFile(fixture.tasksFile, "utf8")).toBe(taskBytes);
  });

  it("records one durable shadow decision without changing task bytes or grant use count", async () => {
    const fixture = await createFixture();
    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };
    const taskBytes = await readFile(fixture.tasksFile, "utf8");

    const shadowed = await run(["shadow", grant.id, "--json"]);

    expect(shadowed.errors).toEqual([]);
    expect(JSON.parse(shadowed.output.join(""))).toMatchObject({
      enforcementDecision: "confirm",
      grantId: grant.id,
      shadowAssessment: "wouldAllowStanding"
    });
    expect(await readFile(fixture.tasksFile, "utf8")).toBe(taskBytes);
    const listed = await run(["list", "--json"]);
    expect(JSON.parse(listed.output.join(""))).toMatchObject({ grants: [{ usedCount: 0 }] });
  });

  it("reports only durable shadow decisions with stable review semantics", async () => {
    const fixture = await createFixture();
    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };
    await run(["shadow", grant.id, "--json"]);

    const reported = await run(["report", "--json"]);

    expect(reported.errors).toEqual([]);
    expect(JSON.parse(reported.output.join(""))).toEqual({
      review: {
        minimumRealDecisions: 20,
        observedOrganicOpportunities: 0,
        promotion: "explicit-user-decision-only",
        status: "collecting",
        targetRealDecisions: 50
      },
      schemaVersion: 2,
      sources: {
        manualCli: {
          assessments: { wouldAllowStanding: 1, wouldConfirm: 0, wouldDeny: 0 },
          classification: "legacy-read-only",
          observedDecisions: 1,
          rationales: [{ count: 1, rationale: "exact active standing grant" }],
          unique: { days: 1, tasks: 1, threads: 1 }
        },
        runtimeOpportunity: {
          assessments: { wouldAllowStanding: 0, wouldConfirm: 0, wouldDeny: 0 },
          classification: "organic-runtime-opportunity",
          observedDecisions: 0,
          rationales: [],
          unique: { days: 0, tasks: 0, threads: 0 }
        }
      }
    });
  });

  it("fails closed on corrupt autonomy persistence without overwriting it", async () => {
    const fixture = await createFixture();
    const corrupt = "{not valid progressive autonomy json\n";
    await writeFile(fixture.autonomyFile, corrupt, "utf8");

    const listed = await run(["list", "--json"]);

    expect(listed.errors.join("")).toContain("store is corrupt");
    expect(process.exitCode).toBe(2);
    expect(await readFile(fixture.autonomyFile, "utf8")).toBe(corrupt);
  });

  it("fails the v2 report on corrupt runtime opportunity persistence without overwriting it", async () => {
    const fixture = await createFixture();
    const corrupt = JSON.stringify({ opportunities: [], schemaVersion: 999, traces: [] });
    await writeFile(fixture.opportunitiesFile, corrupt, "utf8");

    const reported = await run(["report", "--json"]);

    expect(reported.errors.join("")).toContain("opportunity store is corrupt");
    expect(process.exitCode).toBe(2);
    expect(await readFile(fixture.opportunitiesFile, "utf8")).toBe(corrupt);
  });

  it("fails the v2 report on a canonical-trace identity mismatch without overwriting evidence", async () => {
    const fixture = await createFixture();
    const envelope = {
      action: "muse.tasks.complete-linked-next-step" as const,
      idempotencyKey: `runtime-opportunity:run-report:${fixture.taskId}`,
      link: {
        artifactType: "task" as const,
        linkedAt: "2026-07-17T02:00:00.000Z",
        providerId: "local" as const,
        role: "next-step" as const,
        taskId: fixture.taskId
      },
      schemaVersion: 1 as const,
      threadId: fixture.threadId,
      traceId: "runtime-tool:run-report:call-1",
      transition: { from: "open" as const, to: "done" as const },
      userId: "dogfood-user"
    };
    await new FileProgressiveAutonomyOpportunityStore({ file: fixture.opportunitiesFile }).record({
      enforcementDecision: "confirm",
      envelope,
      id: "runtime-report-1",
      origin: "runtime-opportunity",
      rationale: "explicit confirmation required",
      recordedAt: "2026-07-17T03:00:00.000Z",
      runId: "run-report",
      shadowAssessment: "wouldConfirm",
      shadowRationale: "no exact active standing grant",
      toolCallId: "call-1"
    });
    const state = JSON.parse(await readFile(fixture.opportunitiesFile, "utf8")) as {
      traces: Array<{ envelope: { traceId: string }; toolCallId: string }>;
    };
    state.traces[0]!.toolCallId = "call-2";
    state.traces[0]!.envelope.traceId = "runtime-tool:run-report:call-2";
    const corrupt = JSON.stringify(state);
    await writeFile(fixture.opportunitiesFile, corrupt, "utf8");

    const reported = await run(["report", "--json"]);

    expect(reported.errors.join("")).toContain("opportunity store is corrupt");
    expect(process.exitCode).toBe(2);
    expect(await readFile(fixture.opportunitiesFile, "utf8")).toBe(corrupt);
  });

  it("records wouldDeny after unlink-relink without mutating the task or consuming a use", async () => {
    const fixture = await createFixture();
    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };
    await unlinkArtifact(fixture.attunementFile, {
      artifactId: fixture.taskId,
      artifactType: "task",
      threadId: fixture.threadId
    });
    await linkArtifact(fixture.attunementFile, {
      artifactId: fixture.taskId,
      artifactType: "task",
      role: "next-step",
      threadId: fixture.threadId
    }, {
      now: () => new Date("2026-07-17T03:00:00.000Z"),
      validateArtifact: async (input) => input
    });
    const taskBytes = await readFile(fixture.tasksFile, "utf8");

    const shadowed = await run(["shadow", grant.id, "--json"]);

    expect(shadowed.errors).toEqual([]);
    expect(JSON.parse(shadowed.output.join(""))).toMatchObject({ shadowAssessment: "wouldDeny" });
    expect(await readFile(fixture.tasksFile, "utf8")).toBe(taskBytes);
    const listed = await run(["list", "--json"]);
    expect(JSON.parse(listed.output.join(""))).toMatchObject({ grants: [{ usedCount: 0 }] });
  });

  it("rejects an unknown grant without writing evidence or touching tasks", async () => {
    const fixture = await createFixture();
    await run(["grant-next-step", fixture.threadId, "--json"]);
    const autonomyBytes = await readFile(fixture.autonomyFile, "utf8");
    const taskBytes = await readFile(fixture.tasksFile, "utf8");

    const shadowed = await run(["shadow", "missing-grant", "--json"]);

    expect(shadowed.errors.join("")).toContain("does not exist");
    expect(process.exitCode).toBe(2);
    expect(await readFile(fixture.autonomyFile, "utf8")).toBe(autonomyBytes);
    expect(await readFile(fixture.tasksFile, "utf8")).toBe(taskBytes);
  });

  it("rejects a closed linked task without evidence, task mutation, or use consumption", async () => {
    const fixture = await createFixture();
    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };
    const tasks = await readTasks(fixture.tasksFile);
    await writeTasks(fixture.tasksFile, tasks.map((task) => task.id === fixture.taskId
      ? { ...task, completedAt: "2026-07-17T04:00:00.000Z", status: "done" }
      : task));
    const autonomyBytes = await readFile(fixture.autonomyFile, "utf8");
    const taskBytes = await readFile(fixture.tasksFile, "utf8");

    const shadowed = await run(["shadow", grant.id, "--json"]);

    expect(shadowed.errors.join("")).toContain("not open");
    expect(await readFile(fixture.autonomyFile, "utf8")).toBe(autonomyBytes);
    expect(await readFile(fixture.tasksFile, "utf8")).toBe(taskBytes);
    const listed = await run(["list", "--json"]);
    expect(JSON.parse(listed.output.join(""))).toMatchObject({ grants: [{ usedCount: 0 }] });
  });

  it("rejects grant bounds outside the fixed CLI contract before creating authority", async () => {
    const fixture = await createFixture();

    const invalidUses = await run(["grant-next-step", fixture.threadId, "--max-uses", "51", "--json"]);

    expect(invalidUses.errors.join("")).toContain("max-uses must be an integer from 1 to 50");
    await expect(readFile(fixture.autonomyFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("runs grant to shadow to report to revoke under an isolated default HOME", async () => {
    const fixture = await createFixture({ defaultHomePaths: true });
    const taskBytes = await readFile(fixture.tasksFile, "utf8");

    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };
    await run(["shadow", grant.id, "--json"]);
    const reported = await run(["report", "--json"]);
    const revoked = await run(["revoke", grant.id, "--json"]);

    expect(JSON.parse(reported.output.join(""))).toMatchObject({
      review: { observedOrganicOpportunities: 0 },
      sources: { manualCli: { observedDecisions: 1 } }
    });
    expect(JSON.parse(revoked.output.join(""))).toMatchObject({ revokedAt: expect.any(String), usedCount: 0 });
    expect(await readFile(fixture.tasksFile, "utf8")).toBe(taskBytes);
    expect(fixture.autonomyFile).toContain(join(".muse", "progressive-autonomy.json"));
  });

  it("records wouldConfirm for an expired existing grant without mutation or use consumption", async () => {
    const fixture = await createFixture();
    const granted = await run(["grant-next-step", fixture.threadId, "--json"]);
    const grant = JSON.parse(granted.output.join("")) as { readonly id: string };
    const state = JSON.parse(await readFile(fixture.autonomyFile, "utf8")) as {
      grants: Array<{ grant: { expiresAt: string } }>;
    };
    state.grants[0]!.grant.expiresAt = new Date(Date.now() - 1).toISOString();
    await writeFile(fixture.autonomyFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    const taskBytes = await readFile(fixture.tasksFile, "utf8");

    const shadowed = await run(["shadow", grant.id, "--json"]);

    expect(shadowed.errors).toEqual([]);
    expect(JSON.parse(shadowed.output.join(""))).toMatchObject({ shadowAssessment: "wouldConfirm" });
    expect(await readFile(fixture.tasksFile, "utf8")).toBe(taskBytes);
    const listed = await run(["list", "--json"]);
    expect(JSON.parse(listed.output.join(""))).toMatchObject({ grants: [{ usedCount: 0 }] });
  });

  async function run(args: readonly string[]): Promise<{ readonly errors: string[]; readonly output: string[] }> {
    const output: string[] = [];
    const errors: string[] = [];
    const program = createProgram({
      stderr: (message) => { errors.push(message); },
      stdout: (message) => { output.push(message); }
    } satisfies ProgramIO);
    await program.parseAsync(["node", "muse", "autonomy", ...args], { from: "node" });
    return { errors, output };
  }

  async function createFixture(options: { readonly defaultHomePaths?: boolean } = {}): Promise<{
    readonly attunementFile: string;
    readonly autonomyFile: string;
    readonly opportunitiesFile: string;
    readonly tasksFile: string;
    readonly taskId: string;
    readonly threadId: string;
  }> {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-cli-"));
    dirs.push(dir);
    const dataDir = options.defaultHomePaths ? join(dir, ".muse") : dir;
    const attunementFile = join(dataDir, "attunement.json");
    const tasksFile = join(dataDir, "tasks.json");
    const autonomyFile = join(dataDir, "progressive-autonomy.json");
    const opportunitiesFile = join(dataDir, "progressive-autonomy-opportunities.json");
    const taskId = "task-next";
    const nextEnv: NodeJS.ProcessEnv = {
      ...originalEnv,
      HOME: dir,
      MUSE_USER_ID: "dogfood-user"
    };
    if (options.defaultHomePaths) {
      delete nextEnv.MUSE_ATTUNEMENT_FILE;
      delete nextEnv.MUSE_PROGRESSIVE_AUTONOMY_FILE;
      delete nextEnv.MUSE_PROGRESSIVE_AUTONOMY_OPPORTUNITIES_FILE;
      delete nextEnv.MUSE_TASKS_FILE;
    } else {
      nextEnv.MUSE_ATTUNEMENT_FILE = attunementFile;
      nextEnv.MUSE_PROGRESSIVE_AUTONOMY_FILE = autonomyFile;
      nextEnv.MUSE_PROGRESSIVE_AUTONOMY_OPPORTUNITIES_FILE = opportunitiesFile;
      nextEnv.MUSE_TASKS_FILE = tasksFile;
    }
    process.env = nextEnv;
    await writeTasks(tasksFile, [{
      createdAt: "2026-07-17T00:00:00.000Z",
      id: taskId,
      status: "open",
      title: "Finish the real linked next step"
    }]);
    const thread = await createPersonalThread(attunementFile, { kind: "life", title: "Life" }, {
      idFactory: () => "life",
      now: () => new Date("2026-07-17T01:00:00.000Z")
    });
    await linkArtifact(attunementFile, {
      artifactId: taskId,
      artifactType: "task",
      role: "next-step",
      threadId: thread.id
    }, {
      now: () => new Date("2026-07-17T02:00:00.000Z"),
      validateArtifact: async (input) => input
    });
    return {
      attunementFile,
      autonomyFile,
      opportunitiesFile,
      taskId,
      tasksFile,
      threadId: thread.id
    };
  }
});
