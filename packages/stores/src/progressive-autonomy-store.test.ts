import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { fingerprintLocalTaskSnapshot, type StandingGrantInput } from "@muse/policy";
import { afterEach, describe, expect, it } from "vitest";

import { FileProgressiveAutonomyAdminStore } from "./progressive-autonomy-store.js";

const grantInput: StandingGrantInput = {
  action: "muse.tasks.complete-linked-next-step",
  executorVersion: 1,
  expiresAt: "2026-07-18T00:00:00.000Z",
  link: {
    artifactType: "task",
    linkedAt: "2026-07-17T01:00:00.000Z",
    providerId: "local",
    role: "next-step",
    taskId: "task-1"
  },
  maxUses: 1,
  policyVersion: 1,
  schemaVersion: 1,
  threadId: "thread-1",
  transition: { from: "open", to: "done" },
  userId: "user-1"
};

describe("FileProgressiveAutonomyStore", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it("keeps the authority-minting admin adapter out of the general stores barrel", async () => {
    const generalStores: Record<string, unknown> = await import("./index.js");
    expect("FileProgressiveAutonomyAdminStore" in generalStores).toBe(false);
  });

  it("durably issues, reads, and revokes an exact bounded grant", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const options = {
      file,
      verifyUserAuthorization: (candidate: unknown, userId: string) =>
        candidate === authorization && userId === "user-1"
    };
    const store = new FileProgressiveAutonomyAdminStore(options);

    expect("issueGrant" in store.executorStore()).toBe(false);
    await expect(store.issueGrant({}, grantInput)).rejects.toThrow("trusted user authorization");

    const issued = await store.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    expect(await new FileProgressiveAutonomyAdminStore(options).executorStore().getGrant("grant-1")).toEqual({
      grant: issued,
      revokedAt: undefined,
      usedCount: 0
    });

    await store.revokeGrant(authorization, "grant-1", {
      now: () => new Date("2026-07-17T12:00:00.000Z")
    });
    expect(await new FileProgressiveAutonomyAdminStore(options).executorStore().getGrant("grant-1")).toEqual({
      grant: issued,
      revokedAt: "2026-07-17T12:00:00.000Z",
      usedCount: 0
    });
  });

  it("fails closed on a corrupt authority store without overwriting it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const raw = '{"schemaVersion":1,"grants":[],"unexpected":true}\n';
    await writeFile(file, raw, "utf8");
    const store = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: () => true
    });

    await expect(store.executorStore().getGrant("grant-1")).rejects.toThrow("store is corrupt");
    expect(await readFile(file, "utf8")).toBe(raw);
  });

  it("rejects a prepared execution with a missing grant without changing the readable store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const before = openTask();
    const intendedAfter = doneTask(before);
    const rawBefore = await readFile(file, "utf8");

    await expect(admin.executorStore().prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: envelopeFor(grant),
      executionId: "execution-missing-grant",
      grantId: "missing-grant",
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: "2026-07-17T11:59:00.000Z"
    })).rejects.toThrow("invalid progressive autonomy state");

    expect(await readFile(file, "utf8")).toBe(rawBefore);
    expect(await admin.executorStore().getGrant(grant.id)).toMatchObject({ usedCount: 0 });
    expect(await admin.executorStore().getExecution("execution-missing-grant")).toBeUndefined();
  });

  it("rejects a prepared execution whose envelope does not exactly match its grant without a partial write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const before = openTask();
    const intendedAfter = doneTask(before);
    const rawBefore = await readFile(file, "utf8");

    await expect(admin.executorStore().prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: { ...envelopeFor(grant), threadId: "wrong-thread" },
      executionId: "execution-scope-mismatch",
      grantId: grant.id,
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: "2026-07-17T11:59:00.000Z"
    })).rejects.toThrow("invalid progressive autonomy state");

    expect(await readFile(file, "utf8")).toBe(rawBefore);
    expect(await admin.executorStore().getGrant(grant.id)).toMatchObject({ usedCount: 0 });
    expect(await admin.executorStore().getExecution("execution-scope-mismatch")).toBeUndefined();
  });

  it("rejects invalid prepared fingerprints without changing the readable store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const before = openTask();
    const intendedAfter = doneTask(before);
    const rawBefore = await readFile(file, "utf8");

    await expect(admin.executorStore().prepareExecution({
      before,
      beforeFingerprint: "not-the-before-fingerprint",
      envelope: envelopeFor(grant),
      executionId: "execution-invalid-fingerprint",
      grantId: grant.id,
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: "2026-07-17T11:59:00.000Z"
    })).rejects.toThrow("invalid progressive autonomy state");

    expect(await readFile(file, "utf8")).toBe(rawBefore);
    expect(await admin.executorStore().getGrant(grant.id)).toMatchObject({ usedCount: 0 });
    expect(await admin.executorStore().getExecution("execution-invalid-fingerprint")).toBeUndefined();
  });

  it("rejects a conflicting replay of an existing execution and idempotency key before persistence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const executor = admin.executorStore();
    const before = openTask();
    const intendedAfter = doneTask(before);
    const prepared = {
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: envelopeFor(grant),
      executionId: "execution-idempotent",
      grantId: grant.id,
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: "2026-07-17T11:59:00.000Z"
    };
    await executor.prepareExecution(prepared);
    const rawBefore = await readFile(file, "utf8");

    await expect(executor.prepareExecution({
      ...prepared,
      envelope: { ...prepared.envelope, traceId: "different-trace" }
    })).rejects.toThrow("idempotency key conflicts");

    expect(await readFile(file, "utf8")).toBe(rawBefore);
    expect(await executor.getExecution(prepared.executionId)).toMatchObject({
      envelope: { traceId: "trace" },
      status: "prepared"
    });
  });

  it("rejects a mismatched observed fingerprint for succeeded completion without a partial receipt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const executor = admin.executorStore();
    const before = openTask();
    const intendedAfter = doneTask(before);
    await executor.prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: envelopeFor(grant),
      executionId: "execution-success-observation",
      grantId: grant.id,
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: "2026-07-17T11:59:00.000Z"
    });
    await executor.claimExecution("execution-success-observation", {
      executorVersion: 1,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" })
    });
    const rawBefore = await readFile(file, "utf8");

    await expect(executor.finishExecution("execution-success-observation", {
      observedAfterFingerprint: "not-the-intended-fingerprint",
      rationale: "claimed success",
      recordedAt: "2026-07-17T12:00:01.000Z",
      status: "succeeded"
    })).rejects.toThrow("succeeded execution requires exact intended after observation");
    await expect(executor.finishExecution("execution-success-observation", {
      rationale: "claimed success without observation",
      recordedAt: "2026-07-17T12:00:01.000Z",
      status: "succeeded"
    })).rejects.toThrow("succeeded execution requires exact intended after observation");

    expect(await readFile(file, "utf8")).toBe(rawBefore);
    const reloaded = new FileProgressiveAutonomyAdminStore({ file, verifyUserAuthorization: () => false })
      .executorStore();
    expect(await reloaded.getExecution("execution-success-observation")).toMatchObject({ status: "executing" });
    expect(await reloaded.listActionReceipts()).toHaveLength(0);
  });

  it("retains and reloads a valid succeeded receipt while rejecting corrupt succeeded observations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const executor = admin.executorStore();
    const before = openTask();
    const intendedAfter = doneTask(before);
    const intendedAfterFingerprint = fingerprintLocalTaskSnapshot(intendedAfter);
    await executor.prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: envelopeFor(grant),
      executionId: "execution-valid-success",
      grantId: grant.id,
      intendedAfter,
      intendedAfterFingerprint,
      preparedAt: "2026-07-17T11:59:00.000Z"
    });
    await executor.claimExecution("execution-valid-success", {
      executorVersion: 1,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" })
    });
    await executor.finishExecution("execution-valid-success", {
      observedAfterFingerprint: intendedAfterFingerprint,
      rationale: "exact success",
      recordedAt: "2026-07-17T12:00:01.000Z",
      status: "succeeded"
    });
    const validRaw = await readFile(file, "utf8");

    await expect(executor.finishExecution("execution-valid-success", {
      observedAfterFingerprint: "conflicting-replay-observation",
      rationale: "conflicting replay",
      recordedAt: "2026-07-17T12:00:02.000Z",
      status: "succeeded"
    })).rejects.toThrow("succeeded execution requires exact intended after observation");
    expect(await readFile(file, "utf8")).toBe(validRaw);
    const reloaded = new FileProgressiveAutonomyAdminStore({ file, verifyUserAuthorization: () => false })
      .executorStore();
    expect(await reloaded.listActionReceipts()).toMatchObject([{
      observedAfterFingerprint: intendedAfterFingerprint,
      status: "succeeded"
    }]);

    const corruptions: Array<(receipt: Record<string, unknown>) => void> = [
      (receipt) => { receipt.observedAfterFingerprint = "mismatched"; },
      (receipt) => { delete receipt.observedAfterFingerprint; }
    ];
    for (const corrupt of corruptions) {
      const state = JSON.parse(validRaw) as { receipts: Array<Record<string, unknown>> };
      corrupt(state.receipts[0]!);
      await writeFile(file, `${JSON.stringify(state)}\n`, "utf8");
      await expect(reloaded.getExecution("execution-valid-success")).rejects.toThrow("store is corrupt");
    }
  });

  it("fails closed on duplicate and cross-record-inconsistent durable authority state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const admin = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await admin.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const executor = admin.executorStore();
    const before = {
      createdAt: "2026-07-16T00:00:00.000Z",
      id: "task-1",
      status: "open" as const,
      title: "Finish exact next step"
    };
    const intendedAfter = {
      ...before,
      completedAt: "2026-07-17T12:00:00.000Z",
      status: "done" as const
    };
    await executor.prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: { ...envelopeFor(grant), idempotencyKey: "idem-shadow", traceId: "trace-shadow" },
      executionId: "execution-shadow",
      grantId: grant.id,
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: "2026-07-17T11:58:00.000Z"
    });
    await executor.claimExecution("execution-shadow", {
      executorVersion: 1,
      mode: "shadow",
      now: () => new Date("2026-07-17T11:59:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" })
    });
    await executor.prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: { ...envelopeFor(grant), idempotencyKey: "idem-live", traceId: "trace-live" },
      executionId: "execution-live",
      grantId: grant.id,
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: "2026-07-17T11:59:00.000Z"
    });
    await executor.claimExecution("execution-live", {
      executorVersion: 1,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" })
    });
    await executor.finishExecution("execution-live", {
      observedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      rationale: "exact task CAS reached the intended after-state",
      recordedAt: "2026-07-17T12:00:01.000Z",
      status: "succeeded"
    });
    await executor.claimUndo("execution-live", {
      validateCurrentState: async () => "exact-after"
    });
    await executor.recordUndo("execution-live", {
      rationale: "restored",
      recordedAt: "2026-07-17T12:00:02.000Z",
      restoredFingerprint: fingerprintLocalTaskSnapshot(before)
    });

    interface RawState {
      executions: Array<Record<string, unknown>>;
      grants: Array<{ grant: Record<string, unknown>; usedCount: number }>;
      receipts: Array<Record<string, unknown>>;
      shadowReceipts: Array<Record<string, unknown>>;
      undoReceipts: Array<Record<string, unknown>>;
    }
    const valid = JSON.parse(await readFile(file, "utf8")) as RawState;
    const corruptions: Array<(state: RawState) => void> = [
      (state) => { state.executions.push(structuredClone(state.executions[0]!)); },
      (state) => {
        state.executions.push({ ...structuredClone(state.executions[0]!), executionId: "duplicate-idempotency" });
      },
      (state) => { state.executions[1]!.grantId = "missing-grant"; },
      (state) => {
        (state.executions[1]!.envelope as Record<string, unknown>).threadId = "wrong-thread";
      },
      (state) => { state.receipts.push(structuredClone(state.receipts[0]!)); },
      (state) => { state.shadowReceipts.push(structuredClone(state.shadowReceipts[0]!)); },
      (state) => { state.undoReceipts.push(structuredClone(state.undoReceipts[0]!)); },
      (state) => { state.shadowReceipts[0]!.id = state.receipts[0]!.id; },
      (state) => { state.grants[0]!.usedCount = 0; }
    ];
    for (const corrupt of corruptions) {
      const state = structuredClone(valid);
      corrupt(state);
      await writeFile(file, `${JSON.stringify(state)}\n`, "utf8");
      await expect(executor.getGrant(grant.id)).rejects.toThrow("store is corrupt");
    }
  });

  it("serializes concurrent claims so maxUses one reserves exactly one execution", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const store = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await store.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const executor = store.executorStore();
    const before = {
      createdAt: "2026-07-16T00:00:00.000Z",
      id: "task-1",
      status: "open" as const,
      title: "Finish exact next step"
    };
    const intendedAfter = {
      ...before,
      completedAt: "2026-07-17T12:00:00.000Z",
      status: "done" as const
    };
    for (const suffix of ["a", "b"] as const) {
      await executor.prepareExecution({
        before,
        beforeFingerprint: fingerprintLocalTaskSnapshot(before),
        envelope: { ...envelopeFor(grant), idempotencyKey: `idem-${suffix}`, traceId: `trace-${suffix}` },
        executionId: `execution-${suffix}`,
        grantId: grant.id,
        intendedAfter,
        intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
        preparedAt: "2026-07-17T11:59:00.000Z"
      });
    }

    const claims = await Promise.all(["a", "b"].map((suffix) => executor.claimExecution(`execution-${suffix}`, {
      executorVersion: 1,
      mode: "live" as const,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" as const })
    })));

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect((await executor.getGrant(grant.id))?.usedCount).toBe(1);
  });

  it("checks a durable user veto inside the same serialized claim boundary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const store = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await store.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    await store.recordVeto(authorization, {
      action: grant.action,
      link: grant.link,
      threadId: grant.threadId,
      userId: grant.userId
    }, {
      idFactory: () => "veto-1",
      now: () => new Date("2026-07-17T10:00:00.000Z")
    });
    const executor = store.executorStore();
    const before = {
      createdAt: "2026-07-16T00:00:00.000Z",
      id: "task-1",
      status: "open" as const,
      title: "Finish exact next step"
    };
    await executor.prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: envelopeFor(grant),
      executionId: "execution-vetoed",
      grantId: grant.id,
      intendedAfter: { ...before, completedAt: "2026-07-17T12:00:00.000Z", status: "done" },
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot({ ...before, completedAt: "2026-07-17T12:00:00.000Z", status: "done" }),
      preparedAt: "2026-07-17T11:59:00.000Z"
    });

    const claim = await executor.claimExecution("execution-vetoed", {
      executorVersion: 1,
      mode: "live",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" })
    });

    expect(claim).toMatchObject({
      claimed: false,
      decision: { enforcementDecision: "deny", shadowAssessment: "wouldDeny" }
    });
    expect((await executor.getGrant(grant.id))?.usedCount).toBe(0);
  });

  it("records shadow assessment durably without changing confirmation enforcement", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
    dirs.push(dir);
    const file = join(dir, "autonomy.json");
    const authorization = Object.freeze({ source: "trusted-user-flow" });
    const store = new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: (candidate) => candidate === authorization
    });
    const grant = await store.issueGrant(authorization, grantInput, {
      idFactory: () => "grant-1",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const executor = store.executorStore();
    const before = {
      createdAt: "2026-07-16T00:00:00.000Z",
      id: "task-1",
      status: "open" as const,
      title: "Finish exact next step"
    };
    await executor.prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: envelopeFor(grant),
      executionId: "execution-shadow",
      grantId: grant.id,
      intendedAfter: { ...before, completedAt: "2026-07-17T12:00:00.000Z", status: "done" },
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot({ ...before, completedAt: "2026-07-17T12:00:00.000Z", status: "done" }),
      preparedAt: "2026-07-17T11:59:00.000Z"
    });

    const claim = await executor.claimExecution("execution-shadow", {
      executorVersion: 1,
      mode: "shadow",
      now: () => new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" })
    });

    expect(claim).toMatchObject({
      claimed: false,
      decision: { enforcementDecision: "confirm", shadowAssessment: "wouldAllowStanding" }
    });
    expect(await new FileProgressiveAutonomyAdminStore({
      file,
      verifyUserAuthorization: () => false
    }).executorStore().listShadowReceipts()).toMatchObject([{
      executionId: "execution-shadow",
      grantId: "grant-1",
      shadowAssessment: "wouldAllowStanding"
    }]);
    expect((await executor.getGrant(grant.id))?.usedCount).toBe(0);
    await expect(executor.claimExecution("execution-shadow", {
      executorVersion: 1,
      mode: "live",
      now: () => new Date("2026-07-17T12:01:00.000Z"),
      policyVersion: 1,
      validateAuthority: async () => ({ authorityStatus: "exact" })
    })).resolves.toMatchObject({ claimed: false, replayed: true });
  });

  it.each(["revoke-before-claim", "revoke-after-claim"] as const)(
    "serializes %s without promising cancellation after a durable claim",
    async (order) => {
      const dir = await mkdtemp(join(tmpdir(), "muse-autonomy-store-"));
      dirs.push(dir);
      const file = join(dir, "autonomy.json");
      const authorization = Object.freeze({ source: "trusted-user-flow" });
      const store = new FileProgressiveAutonomyAdminStore({
        file,
        verifyUserAuthorization: (candidate) => candidate === authorization
      });
      const grant = await store.issueGrant(authorization, grantInput, {
        idFactory: () => "grant-1",
        now: () => new Date("2026-07-17T00:00:00.000Z")
      });
      const executor = store.executorStore();
      const before = {
        createdAt: "2026-07-16T00:00:00.000Z",
        id: "task-1",
        status: "open" as const,
        title: "Finish exact next step"
      };
      await executor.prepareExecution({
        before,
        beforeFingerprint: fingerprintLocalTaskSnapshot(before),
        envelope: envelopeFor(grant),
        executionId: `execution-${order}`,
        grantId: grant.id,
        intendedAfter: { ...before, completedAt: "2026-07-17T12:00:00.000Z", status: "done" },
        intendedAfterFingerprint: fingerprintLocalTaskSnapshot({ ...before, completedAt: "2026-07-17T12:00:00.000Z", status: "done" }),
        preparedAt: "2026-07-17T11:59:00.000Z"
      });
      if (order === "revoke-before-claim") {
        await store.revokeGrant(authorization, grant.id, { now: () => new Date("2026-07-17T11:59:30.000Z") });
      }
      const claim = await executor.claimExecution(`execution-${order}`, {
        executorVersion: 1,
        mode: "live",
        now: () => new Date("2026-07-17T12:00:00.000Z"),
        policyVersion: 1,
        validateAuthority: async () => ({ authorityStatus: "exact" })
      });
      if (order === "revoke-after-claim") {
        await store.revokeGrant(authorization, grant.id, { now: () => new Date("2026-07-17T12:00:30.000Z") });
      }

      expect(claim.claimed).toBe(order === "revoke-after-claim");
      expect(await executor.getGrant(grant.id)).toMatchObject({
        revokedAt: order === "revoke-after-claim"
          ? "2026-07-17T12:00:30.000Z"
          : "2026-07-17T11:59:30.000Z",
        usedCount: order === "revoke-after-claim" ? 1 : 0
      });
      if (order === "revoke-after-claim") {
        const baseReplay = {
          executorVersion: 1,
          mode: "live" as const,
          now: () => new Date("2026-07-17T12:01:00.000Z"),
          policyVersion: 1,
          validateAuthority: async () => ({ authorityStatus: "exact" as const })
        };
        await expect(executor.claimExecution(`execution-${order}`, { ...baseReplay, mode: "shadow" }))
          .resolves.toMatchObject({ claimed: false });
        await expect(executor.claimExecution(`execution-${order}`, { ...baseReplay, hardDeny: true }))
          .resolves.toMatchObject({ claimed: false });
        await expect(executor.claimExecution(`execution-${order}`, { ...baseReplay, policyVersion: 2 }))
          .resolves.toMatchObject({ claimed: false });
        await expect(executor.claimExecution(`execution-${order}`, baseReplay))
          .resolves.toMatchObject({ claimed: true, replayed: true });
      }
    }
  );
});

function envelopeFor(grant: Awaited<ReturnType<FileProgressiveAutonomyAdminStore["issueGrant"]>>) {
  return {
    action: grant.action,
    idempotencyKey: "idem",
    link: grant.link,
    schemaVersion: grant.schemaVersion,
    threadId: grant.threadId,
    traceId: "trace",
    transition: grant.transition,
    userId: grant.userId
  };
}

function openTask() {
  return {
    createdAt: "2026-07-16T00:00:00.000Z",
    id: "task-1",
    status: "open" as const,
    title: "Finish exact next step"
  };
}

function doneTask(before: ReturnType<typeof openTask>) {
  return {
    ...before,
    completedAt: "2026-07-17T12:00:00.000Z",
    status: "done" as const
  };
}
