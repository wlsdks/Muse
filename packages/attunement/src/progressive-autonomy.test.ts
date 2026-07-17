import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mutateTasks, readTaskById, writeTasks } from "@muse/stores";
import { FileProgressiveAutonomyAdminStore } from "@muse/stores/host-progressive-autonomy";
import { afterEach, describe, expect, it } from "vitest";

import {
  completeLinkedNextStep,
  createPersonalThread,
  linkArtifact,
  undoLinkedNextStep,
  unlinkArtifact
} from "./index.js";

describe("completeLinkedNextStep", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it("completes one exact user-linked local next step and writes a durable action receipt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const attunementFile = join(dir, "attunement.json");
    const tasksFile = join(dir, "tasks.json");
    const autonomyFile = join(dir, "autonomy.json");
    const task = {
      createdAt: "2026-07-16T00:00:00.000Z",
      id: "task-1",
      status: "open" as const,
      title: "Finish exact next step"
    };
    await writeTasks(tasksFile, [task]);
    const thread = await createPersonalThread(attunementFile, { kind: "life", title: "Life thread" }, {
      idFactory: () => "thread-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const { link } = await linkArtifact(attunementFile, {
      artifactId: task.id,
      artifactType: "task",
      role: "next-step",
      threadId: thread.id
    }, {
      now: () => new Date("2026-07-17T01:00:00.000Z"),
      validateArtifact: async (input) => input
    });
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file: autonomyFile,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, {
      action: "muse.tasks.complete-linked-next-step",
      executorVersion: 1,
      expiresAt: "2026-07-18T00:00:00.000Z",
      link: {
        artifactType: "task",
        linkedAt: link.linkedAt,
        providerId: "local",
        role: "next-step",
        taskId: task.id
      },
      maxUses: 1,
      policyVersion: 1,
      schemaVersion: 1,
      threadId: thread.id,
      transition: { from: "open", to: "done" },
      userId: "user-1"
    }, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T02:00:00.000Z")
    });
    const autonomyStore = admin.executorStore();

    const result = await completeLinkedNextStep({
      attunementFile,
      autonomyStore,
      envelope: {
        action: grant.action,
        idempotencyKey: "idem-1",
        link: grant.link,
        schemaVersion: 1,
        threadId: thread.id,
        traceId: "trace-1",
        transition: grant.transition,
        userId: grant.userId
      },
      executionId: "execution-1",
      executorVersion: 1,
      grantId: grant.id,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile
    });

    expect(result.status).toBe("succeeded");
    expect(await readTaskById(tasksFile, task.id)).toMatchObject({
      completedAt: "2026-07-17T12:00:00.000Z",
      status: "done"
    });
    expect(await autonomyStore.listActionReceipts()).toMatchObject([{
      beforeFingerprint: result.beforeFingerprint,
      executionId: "execution-1",
      grant: { id: "grant-1" },
      intendedAfterFingerprint: result.intendedAfterFingerprint,
      link: grant.link,
      status: "succeeded",
      threadId: thread.id,
      traceId: "trace-1"
    }]);
  });

  it("reconciles a crash after task write without reserving another use or duplicating the mutation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "crash");
    const options = {
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-crash",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live" as const,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    };

    await expect(completeLinkedNextStep({
      ...options,
      afterTaskCas: async () => {
        throw new Error("injected crash after task write");
      }
    })).rejects.toThrow("injected crash");
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toMatchObject({
      completedAt: "2026-07-17T12:00:00.000Z",
      status: "done"
    });
    expect(await fixture.autonomyStore.listActionReceipts()).toHaveLength(0);

    const replay = await completeLinkedNextStep(options);
    expect(replay.status).toBe("succeeded");
    expect((await fixture.autonomyStore.getGrant(fixture.grant.id))?.usedCount).toBe(1);
    expect(await fixture.autonomyStore.listActionReceipts()).toHaveLength(1);
  });

  it("does not clobber a user task edit made after preparation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "cas");

    const result = await completeLinkedNextStep({
      afterPrepared: async () => {
        await mutateTasks(fixture.tasksFile, (tasks) => tasks.map((task) =>
          task.id === fixture.task.id ? { ...task, title: "User changed this after preparation" } : task
        ));
      },
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-cas",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    });

    expect(result.status).toBe("unknown");
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toMatchObject({
      status: "open",
      title: "User changed this after preparation"
    });
    expect(await fixture.autonomyStore.listActionReceipts()).toMatchObject([{
      status: "unknown"
    }]);
  });

  it("undoes only the exact recorded after-state and leaves a durable undo receipt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "undo");
    await completeLinkedNextStep({
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-undo",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    });

    const undo = await undoLinkedNextStep({
      autonomyStore: fixture.autonomyStore,
      executionId: "execution-undo",
      now: () => new Date("2026-07-17T13:00:00.000Z"),
      tasksFile: fixture.tasksFile
    });

    expect(undo.status).toBe("undone");
    if (undo.status !== "undone") throw new Error("expected undo to succeed");
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toEqual(fixture.task);
    expect(await fixture.autonomyStore.listUndoReceipts()).toMatchObject([{
      executionId: "execution-undo",
      restoredFingerprint: undo.restoredFingerprint
    }]);
  });

  it("refuses undo when the user changed the recorded after-state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "undo-edit");
    await completeLinkedNextStep({
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-undo-edit",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    });
    await mutateTasks(fixture.tasksFile, (tasks) => tasks.map((task) =>
      task.id === fixture.task.id ? { ...task, title: "User edit after completion" } : task
    ));

    const undo = await undoLinkedNextStep({
      autonomyStore: fixture.autonomyStore,
      executionId: "execution-undo-edit",
      tasksFile: fixture.tasksFile
    });

    expect(undo.status).toBe("refused");
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toMatchObject({
      status: "done",
      title: "User edit after completion"
    });
    expect(await fixture.autonomyStore.listUndoReceipts()).toHaveLength(0);
  });

  it("does not treat a user-restored before-state as an undo without a durable undo claim", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "undo-user-restore");
    await completeLinkedNextStep({
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-undo-user-restore",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    });
    await mutateTasks(fixture.tasksFile, (tasks) => tasks.map((task) =>
      task.id === fixture.task.id ? fixture.task : task
    ));

    const undo = await undoLinkedNextStep({
      autonomyStore: fixture.autonomyStore,
      executionId: "execution-undo-user-restore",
      tasksFile: fixture.tasksFile
    });

    expect(undo.status).toBe("refused");
    expect(await fixture.autonomyStore.listUndoReceipts()).toHaveLength(0);
  });

  it("reconciles a crash after task restore from a durable undo claim exactly once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "undo-crash");
    await completeLinkedNextStep({
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-undo-crash",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    });

    await expect(undoLinkedNextStep({
      afterTaskRestore: async () => { throw new Error("crash after task restore"); },
      autonomyStore: fixture.autonomyStore,
      executionId: "execution-undo-crash",
      tasksFile: fixture.tasksFile
    })).rejects.toThrow("crash after task restore");
    expect((await fixture.autonomyStore.getExecution("execution-undo-crash"))?.status).toBe("undoing");
    expect(await fixture.autonomyStore.listUndoReceipts()).toHaveLength(0);
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toEqual(fixture.task);

    await expect(undoLinkedNextStep({
      autonomyStore: fixture.autonomyStore,
      executionId: "execution-undo-crash",
      tasksFile: fixture.tasksFile
    })).resolves.toMatchObject({ status: "undone" });
    expect(await fixture.autonomyStore.listUndoReceipts()).toHaveLength(1);
  });

  it("rejects a stale grant after unlink and relink of the same task", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "relink");
    await unlinkArtifact(fixture.attunementFile, {
      artifactId: fixture.task.id,
      artifactType: "task",
      threadId: fixture.thread.id
    });
    await linkArtifact(fixture.attunementFile, {
      artifactId: fixture.task.id,
      artifactType: "task",
      role: "next-step",
      threadId: fixture.thread.id
    }, {
      now: () => new Date("2026-07-17T11:00:00.000Z"),
      validateArtifact: async (input) => input
    });

    const result = await completeLinkedNextStep({
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-relink",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    });

    expect(result.status).toBe("failed");
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toEqual(fixture.task);
    expect((await fixture.autonomyStore.getGrant(fixture.grant.id))?.usedCount).toBe(0);
  });

  it("keeps a hard deny above an exact grant with zero task mutation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "hard-deny");

    const result = await completeLinkedNextStep({
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-hard-deny",
      executorVersion: 1,
      grantId: fixture.grant.id,
      hardDeny: true,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    });

    expect(result.status).toBe("failed");
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toEqual(fixture.task);
    expect((await fixture.autonomyStore.getGrant(fixture.grant.id))?.usedCount).toBe(0);
  });

  it("never lets shadow, hard-deny, or version-mismatched replay enter task CAS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "replay-context");
    const base = {
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-replay-context",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live" as const,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    };
    await expect(completeLinkedNextStep({
      ...base,
      afterClaim: async () => { throw new Error("stop after durable claim"); }
    })).rejects.toThrow("stop after durable claim");

    await completeLinkedNextStep({ ...base, mode: "shadow" });
    await completeLinkedNextStep({ ...base, hardDeny: true });
    await completeLinkedNextStep({ ...base, policyVersion: 2 });
    expect(await readTaskById(fixture.tasksFile, fixture.task.id)).toEqual(fixture.task);

    expect((await completeLinkedNextStep(base)).status).toBe("succeeded");
  });

  it("returns durable succeeded and undone terminal results without re-entering task CAS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-linked-next-step-"));
    dirs.push(dir);
    const fixture = await createFixture(dir, "terminal-replay");
    const base = {
      attunementFile: fixture.attunementFile,
      autonomyStore: fixture.autonomyStore,
      envelope: fixture.envelope,
      executionId: "execution-terminal-replay",
      executorVersion: 1,
      grantId: fixture.grant.id,
      mode: "live" as const,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      tasksFile: fixture.tasksFile
    };
    await completeLinkedNextStep(base);
    await expect(completeLinkedNextStep({
      ...base,
      afterTaskCas: async () => { throw new Error("must not enter CAS"); }
    })).resolves.toMatchObject({ status: "succeeded" });

    await undoLinkedNextStep({
      autonomyStore: fixture.autonomyStore,
      executionId: base.executionId,
      tasksFile: fixture.tasksFile
    });
    await expect(completeLinkedNextStep({
      ...base,
      afterTaskCas: async () => { throw new Error("must not enter CAS"); }
    })).resolves.toMatchObject({ status: "undone" });
  });
});

async function createFixture(dir: string, suffix: string) {
  const attunementFile = join(dir, "attunement.json");
  const tasksFile = join(dir, "tasks.json");
  const task = {
    createdAt: "2026-07-16T00:00:00.000Z",
    id: `task-${suffix}`,
    status: "open" as const,
    title: "Finish exact next step"
  };
  await writeTasks(tasksFile, [task]);
  const thread = await createPersonalThread(attunementFile, { kind: "life", title: "Life thread" }, {
    idFactory: () => `thread-${suffix}`,
    now: () => new Date("2026-07-17T00:00:00.000Z")
  });
  const { link } = await linkArtifact(attunementFile, {
    artifactId: task.id,
    artifactType: "task",
    role: "next-step",
    threadId: thread.id
  }, {
    now: () => new Date("2026-07-17T01:00:00.000Z"),
    validateArtifact: async (input) => input
  });
  const authorization = Object.freeze({ source: "trusted-user-flow" });
  const admin = new FileProgressiveAutonomyAdminStore({
    file: join(dir, "autonomy.json"),
    verifyUserAuthorization: (candidate) => candidate === authorization
  });
  const grant = await admin.issueGrant(authorization, {
    action: "muse.tasks.complete-linked-next-step",
    executorVersion: 1,
    expiresAt: "2026-07-18T00:00:00.000Z",
    link: {
      artifactType: "task",
      linkedAt: link.linkedAt,
      providerId: "local",
      role: "next-step",
      taskId: task.id
    },
    maxUses: 1,
    policyVersion: 1,
    schemaVersion: 1,
    threadId: thread.id,
    transition: { from: "open", to: "done" },
    userId: "user-1"
  }, {
    idFactory: () => `grant-${suffix}`,
    now: () => new Date("2026-07-17T02:00:00.000Z")
  });
  const envelope = {
    action: grant.action,
    idempotencyKey: `idem-${suffix}`,
    link: grant.link,
    schemaVersion: 1 as const,
    threadId: thread.id,
    traceId: `trace-${suffix}`,
    transition: grant.transition,
    userId: grant.userId
  };
  return { admin, attunementFile, autonomyStore: admin.executorStore(), envelope, grant, task, tasksFile, thread };
}
