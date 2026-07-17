import {
  fingerprintLocalTaskSnapshot,
  type LocalTaskSnapshot,
  type ProgressiveAutonomyActionEnvelope,
  type ProgressiveAutonomyActionReceipt,
  type ProgressiveAutonomyExecutionStatus,
  type ProgressiveAutonomyExecutorStore
} from "@muse/policy";
import { mutateTasks, readTaskById, type PersistedTask } from "@muse/stores";

import { readAttunementState } from "./attunement-store.js";

export interface CompleteLinkedNextStepOptions {
  readonly afterClaim?: () => Promise<void>;
  readonly afterPrepared?: () => Promise<void>;
  readonly afterTaskCas?: () => Promise<void>;
  readonly attunementFile: string;
  readonly autonomyStore: ProgressiveAutonomyExecutorStore;
  readonly envelope: ProgressiveAutonomyActionEnvelope;
  readonly executionId: string;
  readonly executorVersion: number;
  readonly grantId: string;
  readonly hardDeny?: boolean;
  readonly mode: "live" | "shadow";
  readonly now?: () => Date;
  readonly policyVersion: number;
  readonly tasksFile: string;
}

export interface CompleteLinkedNextStepResult {
  readonly beforeFingerprint: string;
  readonly intendedAfterFingerprint: string;
  readonly receipt?: ProgressiveAutonomyActionReceipt;
  readonly reason?: string;
  readonly status: ProgressiveAutonomyExecutionStatus;
}

export interface UndoLinkedNextStepOptions {
  readonly afterTaskRestore?: () => Promise<void>;
  readonly autonomyStore: ProgressiveAutonomyExecutorStore;
  readonly executionId: string;
  readonly now?: () => Date;
  readonly tasksFile: string;
}

export type UndoLinkedNextStepResult =
  | { readonly reason: string; readonly status: "refused" }
  | { readonly restoredFingerprint: string; readonly status: "undone" };

export async function completeLinkedNextStep(
  options: CompleteLinkedNextStepOptions
): Promise<CompleteLinkedNextStepResult> {
  const now = options.now ?? (() => new Date());
  let execution = await options.autonomyStore.getExecution(options.executionId);
  if (execution && (execution.grantId !== options.grantId
    || JSON.stringify(execution.envelope) !== JSON.stringify(options.envelope))) {
    throw new TypeError("execution id cannot be replayed with different authority or action scope");
  }
  let preparedNow = false;
  if (!execution) {
    const current = await readTaskById(options.tasksFile, options.envelope.link.taskId);
    if (!current || current.status !== "open") {
      throw new TypeError("exact linked next-step task is not open; refusing autonomous completion");
    }
    const before = toSnapshot(current);
    const intendedAfter: LocalTaskSnapshot = {
      ...before,
      completedAt: now().toISOString(),
      status: "done"
    };
    execution = await options.autonomyStore.prepareExecution({
      before,
      beforeFingerprint: fingerprintLocalTaskSnapshot(before),
      envelope: options.envelope,
      executionId: options.executionId,
      grantId: options.grantId,
      intendedAfter,
      intendedAfterFingerprint: fingerprintLocalTaskSnapshot(intendedAfter),
      preparedAt: now().toISOString()
    });
    preparedNow = true;
  }
  if (preparedNow) await options.afterPrepared?.();

  if (["succeeded", "failed", "unknown", "undone"].includes(execution.status)) {
    const receipt = (await options.autonomyStore.listActionReceipts())
      .find((entry) => entry.executionId === options.executionId);
    return {
      beforeFingerprint: execution.beforeFingerprint,
      intendedAfterFingerprint: execution.intendedAfterFingerprint,
      ...(receipt ? { receipt } : {}),
      ...(execution.reason ? { reason: execution.reason } : {}),
      status: execution.status
    };
  }

  const claim = await options.autonomyStore.claimExecution(options.executionId, {
    executorVersion: options.executorVersion,
    hardDeny: options.hardDeny,
    mode: options.mode,
    now,
    policyVersion: options.policyVersion,
    validateAuthority: async () => ({
      authorityStatus: await currentLinkAuthorityStatus(options.attunementFile, options.envelope)
    })
  });
  if (!claim.claimed) {
    return {
      beforeFingerprint: execution.beforeFingerprint,
      intendedAfterFingerprint: execution.intendedAfterFingerprint,
      reason: claim.decision.rationale,
      status: claim.execution.status
    };
  }
  await options.afterClaim?.();

  const cas: {
    observedAfterFingerprint?: string;
    status: "succeeded" | "unknown";
  } = { status: "unknown" };
  await mutateTasks(options.tasksFile, (tasks) => {
    const index = tasks.findIndex((task) => task.id === execution!.envelope.link.taskId);
    if (index < 0) return tasks;
    const current = toSnapshot(tasks[index]!);
    const currentFingerprint = fingerprintLocalTaskSnapshot(current);
    cas.observedAfterFingerprint = currentFingerprint;
    if (currentFingerprint === execution!.intendedAfterFingerprint) {
      cas.status = "succeeded";
      return tasks;
    }
    if (currentFingerprint !== execution!.beforeFingerprint) return tasks;
    cas.status = "succeeded";
    cas.observedAfterFingerprint = execution!.intendedAfterFingerprint;
    return tasks.map((task, taskIndex) => taskIndex === index ? toPersistedTask(execution!.intendedAfter) : task);
  });
  await options.afterTaskCas?.();

  const rationale = cas.status === "succeeded"
    ? "exact task CAS reached the intended after-state"
    : "task state no longer matches prepared before or intended after; refusing to clobber it";
  const receipt = await options.autonomyStore.finishExecution(options.executionId, {
    ...(cas.observedAfterFingerprint ? { observedAfterFingerprint: cas.observedAfterFingerprint } : {}),
    rationale,
    recordedAt: now().toISOString(),
    status: cas.status
  });
  return {
    beforeFingerprint: execution.beforeFingerprint,
    intendedAfterFingerprint: execution.intendedAfterFingerprint,
    receipt,
    ...(cas.status === "unknown" ? { reason: rationale } : {}),
    status: cas.status
  };
}

export async function undoLinkedNextStep(
  options: UndoLinkedNextStepOptions
): Promise<UndoLinkedNextStepResult> {
  const existingUndo = (await options.autonomyStore.listUndoReceipts())
    .find((entry) => entry.executionId === options.executionId);
  if (existingUndo) {
    return { restoredFingerprint: existingUndo.restoredFingerprint, status: "undone" };
  }
  const existingExecution = await options.autonomyStore.getExecution(options.executionId);
  if (!existingExecution) {
    return { reason: "only a succeeded recorded action can be undone", status: "refused" };
  }
  const claim = await options.autonomyStore.claimUndo(options.executionId, {
    validateCurrentState: async () => {
      const task = await readTaskById(options.tasksFile, existingExecution.envelope.link.taskId);
      if (!task) return "mismatch";
      const fingerprint = fingerprintLocalTaskSnapshot(toSnapshot(task));
      if (fingerprint === existingExecution.intendedAfterFingerprint) return "exact-after";
      if (fingerprint === existingExecution.beforeFingerprint) return "before";
      return "mismatch";
    }
  });
  if (!claim.claimed) {
    return { reason: claim.reason ?? "undo is already terminal", status: "refused" };
  }
  const execution = claim.execution;
  const undo = { restored: false };
  await mutateTasks(options.tasksFile, (tasks) => {
    const index = tasks.findIndex((task) => task.id === execution.envelope.link.taskId);
    if (index < 0) return tasks;
    const currentFingerprint = fingerprintLocalTaskSnapshot(toSnapshot(tasks[index]!));
    if (claim.replayed && currentFingerprint === execution.beforeFingerprint) {
      undo.restored = true;
      return tasks;
    }
    if (currentFingerprint !== execution.intendedAfterFingerprint) return tasks;
    undo.restored = true;
    return tasks.map((task, taskIndex) => taskIndex === index ? toPersistedTask(execution.before) : task);
  });
  if (!undo.restored) {
    return {
      reason: "current task differs from the recorded after-state; refusing to clobber it",
      status: "refused"
    };
  }
  await options.afterTaskRestore?.();
  const recordedAt = (options.now ?? (() => new Date()))().toISOString();
  const rationale = "exact recorded after-state restored to the prepared before-state";
  const receipt = await options.autonomyStore.recordUndo(options.executionId, {
    rationale,
    recordedAt,
    restoredFingerprint: execution.beforeFingerprint
  });
  return { restoredFingerprint: receipt.restoredFingerprint, status: "undone" };
}

async function currentLinkAuthorityStatus(
  attunementFile: string,
  envelope: ProgressiveAutonomyActionEnvelope
): Promise<"exact" | "missing" | "mismatch"> {
  const state = await readAttunementState(attunementFile);
  const thread = state.threads.find((entry) => entry.id === envelope.threadId);
  if (!thread) return "missing";
  const link = thread.links.find((entry) => entry.artifactType === "task"
    && entry.artifactId === envelope.link.taskId && entry.providerId === "local");
  if (!link) return "missing";
  return link.linkedBy === "user" && link.role === "next-step" && link.linkedAt === envelope.link.linkedAt
    ? "exact"
    : "mismatch";
}

function toSnapshot(task: PersistedTask): LocalTaskSnapshot {
  return {
    createdAt: task.createdAt,
    id: task.id,
    status: task.status,
    title: task.title,
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    ...(task.notes !== undefined ? { notes: task.notes } : {}),
    ...(task.tags ? { tags: [...task.tags] } : {}),
    ...(task.proactive !== undefined ? { proactive: task.proactive } : {}),
    ...(task.urgent !== undefined ? { urgent: task.urgent } : {})
  };
}

function toPersistedTask(task: LocalTaskSnapshot): PersistedTask {
  return {
    ...task,
    ...(task.tags ? { tags: [...task.tags] } : {})
  };
}
