/**
 * On-disk shape and validation for the progressive-autonomy store: the
 * persisted `ProgressiveAutonomyState`, its parser, the cross-collection
 * invariant checks, and the type guards that vet every field of an untrusted
 * JSON file before it is trusted as authority state.
 *
 * A LEAF — the store classes in `progressive-autonomy-store.ts` import these;
 * nothing here reaches back.
 */

import {
  fingerprintLocalTaskSnapshot,
  type LocalTaskSnapshot,
  type LocalTaskNextStepLinkFingerprint,
  type OpenToDoneTransition,
  type ProgressiveAutonomyActionReceipt,
  type ProgressiveAutonomyExecution,
  type ProgressiveAutonomyShadowReceipt,
  type ProgressiveAutonomyUndoReceipt,
  type StandingGrant,
  type StandingGrantRecord,
  type StandingGrantVeto
} from "@muse/policy";

export class ProgressiveAutonomyStoreCorruptError extends Error {
  constructor() {
    super("progressive autonomy store is corrupt; refusing authority");
    this.name = "ProgressiveAutonomyStoreCorruptError";
  }
}

export interface ProgressiveAutonomyState {
  readonly executions: readonly ProgressiveAutonomyExecution[];
  readonly grants: readonly StandingGrantRecord[];
  readonly receipts: readonly ProgressiveAutonomyActionReceipt[];
  readonly schemaVersion: 1;
  readonly shadowReceipts: readonly ProgressiveAutonomyShadowReceipt[];
  readonly undoReceipts: readonly ProgressiveAutonomyUndoReceipt[];
  readonly vetoes: readonly StandingGrantVeto[];
}


export function emptyState(): ProgressiveAutonomyState {
  return {
    executions: [],
    grants: [],
    receipts: [],
    schemaVersion: 1,
    shadowReceipts: [],
    undoReceipts: [],
    vetoes: []
  };
}

export function parseState(value: unknown): ProgressiveAutonomyState {
  if (!isExactRecord(value, ["executions", "grants", "receipts", "schemaVersion", "shadowReceipts", "undoReceipts", "vetoes"])
    || value.schemaVersion !== 1 || !Array.isArray(value.grants) || !value.grants.every(isGrantRecord)
    || !Array.isArray(value.executions) || !value.executions.every(isExecution)
    || !Array.isArray(value.receipts) || !value.receipts.every(isActionReceipt)
    || !Array.isArray(value.shadowReceipts) || !value.shadowReceipts.every(isShadowReceipt)
    || !Array.isArray(value.undoReceipts) || !value.undoReceipts.every(isUndoReceipt)
    || !Array.isArray(value.vetoes) || !value.vetoes.every(isVeto)) {
    throw new ProgressiveAutonomyStoreCorruptError();
  }
  const state: ProgressiveAutonomyState = {
    executions: value.executions,
    grants: value.grants,
    receipts: value.receipts,
    schemaVersion: 1,
    shadowReceipts: value.shadowReceipts,
    undoReceipts: value.undoReceipts,
    vetoes: value.vetoes
  };
  validateStateRelations(state);
  return state;
}

function validateStateRelations(state: ProgressiveAutonomyState): void {
  assertUnique(state.grants.map((record) => record.grant.id));
  assertUnique(state.executions.map((execution) => execution.executionId));
  assertUnique(state.executions.map((execution) => execution.envelope.idempotencyKey));
  assertUnique(state.receipts.map((receipt) => receipt.id));
  assertUnique(state.receipts.map((receipt) => receipt.executionId));
  assertUnique(state.shadowReceipts.map((receipt) => receipt.id));
  assertUnique(state.shadowReceipts.map((receipt) => receipt.executionId));
  assertUnique(state.undoReceipts.map((receipt) => receipt.id));
  assertUnique(state.undoReceipts.map((receipt) => receipt.executionId));
  assertUnique([
    ...state.receipts.map((receipt) => receipt.id),
    ...state.shadowReceipts.map((receipt) => receipt.id),
    ...state.undoReceipts.map((receipt) => receipt.id)
  ]);
  assertUnique(state.vetoes.map((veto) => veto.id));

  const grantById = new Map(state.grants.map((record) => [record.grant.id, record]));
  const executionById = new Map(state.executions.map((execution) => [execution.executionId, execution]));
  const receiptByExecution = new Map(state.receipts.map((receipt) => [receipt.executionId, receipt]));
  const shadowByExecution = new Map(state.shadowReceipts.map((receipt) => [receipt.executionId, receipt]));
  const undoByExecution = new Map(state.undoReceipts.map((receipt) => [receipt.executionId, receipt]));

  for (const execution of state.executions) {
    const grantRecord = grantById.get(execution.grantId);
    if (!grantRecord || !envelopeMatchesGrant(execution.envelope, grantRecord.grant)
      || execution.before.id !== execution.envelope.link.taskId
      || execution.intendedAfter.id !== execution.envelope.link.taskId) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
    const actionReceipt = receiptByExecution.get(execution.executionId);
    const shadowReceipt = shadowByExecution.get(execution.executionId);
    const undoReceipt = undoByExecution.get(execution.executionId);
    const hasClaim = execution.claimContext !== undefined;
    if (hasClaim && (execution.claimContext!.policyVersion !== grantRecord.grant.policyVersion
      || execution.claimContext!.executorVersion !== grantRecord.grant.executorVersion)) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
    if ((execution.status === "prepared" || (execution.status === "failed" && !actionReceipt)) && hasClaim) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
    if (["executing", "succeeded", "unknown", "undoing", "undone"].includes(execution.status) && !hasClaim) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
    if (execution.status === "executing" && (actionReceipt || undoReceipt)) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
    if (["succeeded", "unknown", "undoing", "undone"].includes(execution.status) && !actionReceipt) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
    if (actionReceipt) {
      const expectedStatus = execution.status === "undoing" || execution.status === "undone"
        ? "succeeded"
        : execution.status;
      if (!hasClaim || actionReceipt.status !== expectedStatus || shadowReceipt
        || actionReceipt.executionId !== execution.executionId
        || JSON.stringify(actionReceipt.grant) !== JSON.stringify(grantRecord.grant)
        || actionReceipt.beforeFingerprint !== execution.beforeFingerprint
        || actionReceipt.intendedAfterFingerprint !== execution.intendedAfterFingerprint
        || !sameLink(actionReceipt.link, execution.envelope.link)
        || actionReceipt.threadId !== execution.envelope.threadId
        || actionReceipt.traceId !== execution.envelope.traceId) {
        throw new ProgressiveAutonomyStoreCorruptError();
      }
      if (actionReceipt.status === "succeeded"
        && actionReceipt.observedAfterFingerprint !== execution.intendedAfterFingerprint) {
        throw new ProgressiveAutonomyStoreCorruptError();
      }
    }
    if (shadowReceipt && (execution.status !== "failed" || hasClaim || actionReceipt
      || shadowReceipt.grantId !== execution.grantId
      || JSON.stringify(shadowReceipt.envelope) !== JSON.stringify(execution.envelope)
      || shadowReceipt.rationale !== execution.reason)) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
    if (undoReceipt) {
      if (execution.status !== "undone" || !actionReceipt
        || undoReceipt.actionReceiptId !== actionReceipt.id
        || undoReceipt.executionId !== execution.executionId
        || undoReceipt.intendedAfterFingerprint !== execution.intendedAfterFingerprint
        || undoReceipt.restoredFingerprint !== execution.beforeFingerprint
        || undoReceipt.threadId !== execution.envelope.threadId
        || undoReceipt.traceId !== execution.envelope.traceId) {
        throw new ProgressiveAutonomyStoreCorruptError();
      }
    } else if (execution.status === "undone") {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
  }

  for (const receipt of state.receipts) {
    if (!executionById.has(receipt.executionId)) throw new ProgressiveAutonomyStoreCorruptError();
  }
  for (const receipt of state.shadowReceipts) {
    if (!executionById.has(receipt.executionId) || !grantById.has(receipt.grantId)) {
      throw new ProgressiveAutonomyStoreCorruptError();
    }
  }
  for (const receipt of state.undoReceipts) {
    if (!executionById.has(receipt.executionId)) throw new ProgressiveAutonomyStoreCorruptError();
  }
  for (const record of state.grants) {
    const reserved = state.executions.filter((execution) =>
      execution.grantId === record.grant.id && execution.claimContext !== undefined
    ).length;
    if (record.usedCount !== reserved) throw new ProgressiveAutonomyStoreCorruptError();
  }
}

function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new ProgressiveAutonomyStoreCorruptError();
}

function envelopeMatchesGrant(envelope: ProgressiveAutonomyExecution["envelope"], grant: StandingGrant): boolean {
  return envelope.action === grant.action && envelope.schemaVersion === grant.schemaVersion
    && envelope.threadId === grant.threadId && envelope.userId === grant.userId
    && sameLink(envelope.link, grant.link)
    && envelope.transition.from === grant.transition.from && envelope.transition.to === grant.transition.to;
}

function isGrantRecord(value: unknown): value is StandingGrantRecord {
  if (!isRecord(value)
    || !hasOnlyKeys(value, value.revokedAt === undefined ? ["grant", "usedCount"] : ["grant", "revokedAt", "usedCount"])
    || !isGrant(value.grant)
    || !Number.isSafeInteger(value.usedCount) || (value.usedCount as number) < 0
    || (value.revokedAt !== undefined && !isIso(value.revokedAt))) {
    return false;
  }
  return (value.usedCount as number) <= value.grant.maxUses;
}

function isExecution(value: unknown): value is ProgressiveAutonomyExecution {
  if (!isRecord(value)) return false;
  const optionalKeys = ["claimContext", "completedAt", "executingAt", "reason"].filter((key) => value[key] !== undefined);
  if (!hasOnlyKeys(value, [
    "before", "beforeFingerprint", "envelope", "executionId", "grantId", "intendedAfter",
    "intendedAfterFingerprint", "preparedAt", "status", ...optionalKeys
  ]) || !isTaskSnapshot(value.before) || !isTaskSnapshot(value.intendedAfter)
    || !isEnvelope(value.envelope) || !isNonBlank(value.executionId) || !isNonBlank(value.grantId)
    || !isNonBlank(value.beforeFingerprint) || !isNonBlank(value.intendedAfterFingerprint)
    || fingerprintLocalTaskSnapshot(value.before) !== value.beforeFingerprint
    || fingerprintLocalTaskSnapshot(value.intendedAfter) !== value.intendedAfterFingerprint
    || !isCompletionTransition(value.before, value.intendedAfter)
    || !isIso(value.preparedAt)
    || (value.claimContext !== undefined && !isClaimContext(value.claimContext))
    || !["prepared", "executing", "succeeded", "failed", "unknown", "undoing", "undone"].includes(String(value.status))
    || (value.completedAt !== undefined && !isIso(value.completedAt))
    || (value.executingAt !== undefined && !isIso(value.executingAt))
    || (value.reason !== undefined && !isNonBlank(value.reason))) {
    return false;
  }
  return true;
}

function isClaimContext(value: unknown): boolean {
  return isExactRecord(value, ["claimedAt", "decision", "executorVersion", "hardDeny", "mode", "policyVersion"])
    && isIso(value.claimedAt) && value.mode === "live" && value.hardDeny === false
    && Number.isSafeInteger(value.executorVersion) && (value.executorVersion as number) > 0
    && Number.isSafeInteger(value.policyVersion) && (value.policyVersion as number) > 0
    && isExactRecord(value.decision, ["enforcementDecision", "rationale", "shadowAssessment", "shadowRationale"])
    && value.decision.enforcementDecision === "allow-standing"
    && value.decision.shadowAssessment === "wouldAllowStanding"
    && isNonBlank(value.decision.rationale) && isNonBlank(value.decision.shadowRationale);
}

function isVeto(value: unknown): value is StandingGrantVeto {
  return isExactRecord(value, ["action", "createdAt", "id", "issuedBy", "link", "threadId", "userId"])
    && value.action === "muse.tasks.complete-linked-next-step" && value.issuedBy === "user"
    && isIso(value.createdAt) && isNonBlank(value.id) && isNonBlank(value.threadId) && isNonBlank(value.userId)
    && isLinkFingerprint(value.link);
}

function isShadowReceipt(value: unknown): value is ProgressiveAutonomyShadowReceipt {
  return isExactRecord(value, [
    "enforcementDecision", "envelope", "executionId", "grantId", "id", "rationale", "recordedAt",
    "shadowAssessment", "shadowRationale"
  ]) && (value.enforcementDecision === "deny" || value.enforcementDecision === "confirm")
    && (value.shadowAssessment === "wouldDeny" || value.shadowAssessment === "wouldConfirm"
      || value.shadowAssessment === "wouldAllowStanding")
    && isEnvelope(value.envelope) && isNonBlank(value.executionId) && isNonBlank(value.grantId)
    && isNonBlank(value.id) && isNonBlank(value.rationale) && isNonBlank(value.shadowRationale)
    && isIso(value.recordedAt);
}

function isActionReceipt(value: unknown): value is ProgressiveAutonomyActionReceipt {
  if (!isRecord(value)) return false;
  const optional = value.observedAfterFingerprint === undefined ? [] : ["observedAfterFingerprint"];
  return hasOnlyKeys(value, [
    "beforeFingerprint", "executionId", "grant", "id", "intendedAfterFingerprint", "link", "rationale",
    "recordedAt", "status", "threadId", "traceId", ...optional
  ]) && isNonBlank(value.beforeFingerprint) && isNonBlank(value.executionId) && isGrant(value.grant)
    && isNonBlank(value.id) && isNonBlank(value.intendedAfterFingerprint)
    && isLinkFingerprint(value.link)
    && (value.observedAfterFingerprint === undefined || isNonBlank(value.observedAfterFingerprint))
    && isNonBlank(value.rationale) && isIso(value.recordedAt)
    && (value.status === "succeeded" || value.status === "failed" || value.status === "unknown")
    && isNonBlank(value.threadId) && isNonBlank(value.traceId);
}

function isUndoReceipt(value: unknown): value is ProgressiveAutonomyUndoReceipt {
  return isExactRecord(value, [
    "actionReceiptId", "executionId", "id", "intendedAfterFingerprint", "rationale", "recordedAt",
    "restoredFingerprint", "threadId", "traceId"
  ]) && isNonBlank(value.actionReceiptId) && isNonBlank(value.executionId) && isNonBlank(value.id)
    && isNonBlank(value.intendedAfterFingerprint) && isNonBlank(value.rationale) && isIso(value.recordedAt)
    && isNonBlank(value.restoredFingerprint) && isNonBlank(value.threadId) && isNonBlank(value.traceId);
}

function isEnvelope(value: unknown): boolean {
  return isExactRecord(value, [
    "action", "idempotencyKey", "link", "schemaVersion", "threadId", "traceId", "transition", "userId"
  ]) && value.schemaVersion === 1 && isNonBlank(value.action) && isNonBlank(value.idempotencyKey)
    && isNonBlank(value.threadId) && isNonBlank(value.traceId) && isNonBlank(value.userId)
    && isLinkFingerprint(value.link) && isOpenToDoneTransition(value.transition);
}

function isTaskSnapshot(value: unknown): value is LocalTaskSnapshot {
  if (!isRecord(value)) return false;
  const optional = ["completedAt", "dueAt", "notes", "proactive", "tags", "urgent"]
    .filter((key) => value[key] !== undefined);
  return hasOnlyKeys(value, ["createdAt", "id", "status", "title", ...optional])
    && isIso(value.createdAt) && isNonBlank(value.id) && isNonBlank(value.title)
    && (value.status === "open" || value.status === "done")
    && (value.completedAt === undefined || isIso(value.completedAt))
    && (value.dueAt === undefined || isIso(value.dueAt))
    && (value.notes === undefined || typeof value.notes === "string")
    && (value.proactive === undefined || typeof value.proactive === "boolean")
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")))
    && (value.urgent === undefined || typeof value.urgent === "boolean");
}

function isCompletionTransition(before: unknown, after: unknown): boolean {
  if (!isRecord(before) || !isRecord(after) || before.status !== "open" || after.status !== "done"
    || !isIso(after.completedAt) || before.id !== after.id) {
    return false;
  }
  const beforeRest = { ...before };
  const afterRest = { ...after };
  delete beforeRest.status;
  delete afterRest.status;
  delete afterRest.completedAt;
  return JSON.stringify(beforeRest) === JSON.stringify(afterRest);
}

export function sameLink(left: StandingGrantVeto["link"], right: StandingGrantVeto["link"]): boolean {
  return left.artifactType === right.artifactType && left.linkedAt === right.linkedAt
    && left.providerId === right.providerId && left.role === right.role && left.taskId === right.taskId;
}

function isGrant(value: unknown): value is StandingGrant {
  if (!isExactRecord(value, [
    "action", "executorVersion", "expiresAt", "id", "issuedAt", "issuedBy", "link",
    "maxUses", "policyVersion", "schemaVersion", "threadId", "transition", "userId"
  ]) || value.schemaVersion !== 1
    || value.action !== "muse.tasks.complete-linked-next-step"
    || value.issuedBy !== "user"
    || !isNonBlank(value.id) || !isNonBlank(value.userId) || !isNonBlank(value.threadId)
    || !isIso(value.issuedAt) || !isIso(value.expiresAt)
    || !Number.isSafeInteger(value.maxUses) || (value.maxUses as number) < 1
    || !Number.isSafeInteger(value.policyVersion) || (value.policyVersion as number) < 1
    || !Number.isSafeInteger(value.executorVersion) || (value.executorVersion as number) < 1
    || !isOpenToDoneTransition(value.transition) || !isLinkFingerprint(value.link)) {
    return false;
  }
  return true;
}

function isLinkFingerprint(value: unknown): value is LocalTaskNextStepLinkFingerprint {
  return isExactRecord(value, ["artifactType", "linkedAt", "providerId", "role", "taskId"])
    && value.artifactType === "task" && value.providerId === "local" && value.role === "next-step"
    && isIso(value.linkedAt) && isNonBlank(value.taskId);
}

function isOpenToDoneTransition(value: unknown): value is OpenToDoneTransition {
  return isExactRecord(value, ["from", "to"]) && value.from === "open" && value.to === "done";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, keys);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
