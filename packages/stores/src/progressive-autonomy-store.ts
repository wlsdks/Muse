import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  evaluateProgressiveAutonomy,
  fingerprintLocalTaskSnapshot,
  validateStandingGrantInput,
  type ClaimProgressiveAutonomyExecutionOptions,
  type ClaimProgressiveAutonomyUndoOptions,
  type FinishProgressiveAutonomyExecutionInput,
  type LocalTaskSnapshot,
  type LocalTaskNextStepLinkFingerprint,
  type OpenToDoneTransition,
  type PrepareProgressiveAutonomyExecutionInput,
  type ProgressiveAutonomyActionReceipt,
  type ProgressiveAutonomyAdminStore,
  type ProgressiveAutonomyClaimResult,
  type ProgressiveAutonomyExecution,
  type ProgressiveAutonomyExecutorStore,
  type ProgressiveAutonomyShadowReceipt,
  type ProgressiveAutonomyUndoReceipt,
  type ProgressiveAutonomyUndoClaimResult,
  type RecordProgressiveAutonomyUndoInput,
  type StandingGrant,
  type StandingGrantInput,
  type StandingGrantIssueOptions,
  type StandingGrantRecord,
  type StandingGrantVeto,
  type StandingGrantVetoInput,
  type VerifyStandingGrantUserAuthorization
} from "@muse/policy";

import { atomicWriteFile, withFileMutationQueue } from "./atomic-file-store.js";
import { withFileLock } from "./encrypted-file.js";

interface ProgressiveAutonomyState {
  readonly executions: readonly ProgressiveAutonomyExecution[];
  readonly grants: readonly StandingGrantRecord[];
  readonly receipts: readonly ProgressiveAutonomyActionReceipt[];
  readonly schemaVersion: 1;
  readonly shadowReceipts: readonly ProgressiveAutonomyShadowReceipt[];
  readonly undoReceipts: readonly ProgressiveAutonomyUndoReceipt[];
  readonly vetoes: readonly StandingGrantVeto[];
}

export class ProgressiveAutonomyStoreCorruptError extends Error {
  constructor() {
    super("progressive autonomy store is corrupt; refusing authority");
    this.name = "ProgressiveAutonomyStoreCorruptError";
  }
}

export interface FileProgressiveAutonomyAdminStoreOptions {
  readonly file: string;
  readonly verifyUserAuthorization: VerifyStandingGrantUserAuthorization;
}

export class FileProgressiveAutonomyAdminStore implements ProgressiveAutonomyAdminStore {
  private readonly file: string;
  private readonly verifyUserAuthorization: VerifyStandingGrantUserAuthorization;

  constructor(options: FileProgressiveAutonomyAdminStoreOptions) {
    this.file = options.file;
    this.verifyUserAuthorization = options.verifyUserAuthorization;
  }

  executorStore(): ProgressiveAutonomyExecutorStore {
    return Object.freeze({
      claimUndo: (executionId: string, options: ClaimProgressiveAutonomyUndoOptions) =>
        this.claimUndo(executionId, options),
      claimExecution: (executionId: string, options: ClaimProgressiveAutonomyExecutionOptions) =>
        this.claimExecution(executionId, options),
      finishExecution: (executionId: string, input: FinishProgressiveAutonomyExecutionInput) =>
        this.finishExecution(executionId, input),
      getExecution: (executionId: string) => this.getExecution(executionId),
      getGrant: (grantId: string) => this.getGrant(grantId),
      listActionReceipts: () => this.listActionReceipts(),
      listShadowReceipts: () => this.listShadowReceipts(),
      listUndoReceipts: () => this.listUndoReceipts(),
      prepareExecution: (input: PrepareProgressiveAutonomyExecutionInput) => this.prepareExecution(input),
      recordUndo: (executionId: string, input: RecordProgressiveAutonomyUndoInput) =>
        this.recordUndo(executionId, input)
    });
  }

  async issueGrant(
    authorization: unknown,
    input: StandingGrantInput,
    options: StandingGrantIssueOptions = {}
  ): Promise<StandingGrant> {
    await this.assertUserAuthorization(authorization, input.userId);
    const now = (options.now ?? (() => new Date()))();
    validateStandingGrantInput(input, now);
    const id = (options.idFactory ?? randomUUID)().trim();
    if (id.length === 0) throw new TypeError("grant id must not be blank");
    const grant: StandingGrant = Object.freeze({
      ...input,
      id,
      issuedAt: now.toISOString(),
      issuedBy: "user"
    });
    await this.mutate((state) => {
      if (state.grants.some((record) => record.grant.id === grant.id)) {
        throw new TypeError(`standing grant '${grant.id}' already exists`);
      }
      return {
        result: undefined,
        state: { ...state, grants: [...state.grants, { grant, usedCount: 0 }] }
      };
    });
    return grant;
  }

  private async getGrant(grantId: string): Promise<StandingGrantRecord | undefined> {
    const record = (await this.read()).grants.find((entry) => entry.grant.id === grantId);
    return record ? structuredClone(record) : undefined;
  }

  private async getExecution(executionId: string): Promise<ProgressiveAutonomyExecution | undefined> {
    const execution = (await this.read()).executions.find((entry) => entry.executionId === executionId);
    return execution ? structuredClone(execution) : undefined;
  }

  private async listActionReceipts(): Promise<readonly ProgressiveAutonomyActionReceipt[]> {
    return structuredClone((await this.read()).receipts);
  }

  async listGrantRecords(): Promise<readonly StandingGrantRecord[]> {
    return structuredClone((await this.read()).grants);
  }

  private async listShadowReceipts(): Promise<readonly ProgressiveAutonomyShadowReceipt[]> {
    return structuredClone((await this.read()).shadowReceipts);
  }

  private async listUndoReceipts(): Promise<readonly ProgressiveAutonomyUndoReceipt[]> {
    return structuredClone((await this.read()).undoReceipts);
  }

  private async prepareExecution(
    input: PrepareProgressiveAutonomyExecutionInput
  ): Promise<ProgressiveAutonomyExecution> {
    return this.mutate((state) => {
      const existing = state.executions.find((entry) =>
        entry.executionId === input.executionId || entry.envelope.idempotencyKey === input.envelope.idempotencyKey
      );
      if (existing) {
        if (existing.executionId !== input.executionId
          || existing.envelope.idempotencyKey !== input.envelope.idempotencyKey) {
          throw new TypeError("progressive autonomy idempotency key conflicts with another execution");
        }
        const {
          claimContext: _claimContext,
          completedAt: _completedAt,
          executingAt: _executingAt,
          reason: _reason,
          status: _status,
          ...preparedInput
        } = existing;
        if (!isDeepStrictEqual(preparedInput, input)) {
          throw new TypeError("progressive autonomy idempotency key conflicts with different input");
        }
        return { result: structuredClone(existing), state };
      }
      const execution: ProgressiveAutonomyExecution = { ...structuredClone(input), status: "prepared" };
      return {
        result: structuredClone(execution),
        state: { ...state, executions: [...state.executions, execution] }
      };
    });
  }

  private async claimExecution(
    executionId: string,
    options: ClaimProgressiveAutonomyExecutionOptions
  ): Promise<ProgressiveAutonomyClaimResult> {
    return this.mutate<ProgressiveAutonomyClaimResult>(async (state) => {
      const execution = state.executions.find((entry) => entry.executionId === executionId);
      if (!execution) throw new TypeError(`progressive autonomy execution '${executionId}' does not exist`);
      const grantRecord = state.grants.find((entry) => entry.grant.id === execution.grantId);
      const now = (options.now ?? (() => new Date()))();
      if (execution.status === "executing") {
        const sameClaimContext = execution.claimContext?.mode === "live"
          && options.mode === "live" && options.hardDeny !== true
          && execution.claimContext.policyVersion === options.policyVersion
          && execution.claimContext.executorVersion === options.executorVersion;
        if (sameClaimContext) {
          return {
            result: {
              claimed: true,
              decision: execution.claimContext!.decision,
              execution: structuredClone(execution),
              replayed: true
            },
            state
          };
        }
        const decision = evaluateProgressiveAutonomy({
          authorityStatus: "exact",
          envelope: execution.envelope,
          executorVersion: options.executorVersion,
          grant: grantRecord?.grant,
          grantStatus: "active",
          hardDeny: options.hardDeny,
          mode: options.mode,
          now,
          policyVersion: options.policyVersion,
          remainingUses: grantRecord ? grantRecord.grant.maxUses - grantRecord.usedCount + 1 : 0
        });
        return { result: { claimed: false, decision, execution: structuredClone(execution), replayed: true }, state };
      }
      if (execution.status !== "prepared") {
        const decision = evaluateProgressiveAutonomy({
          authorityStatus: "missing",
          envelope: execution.envelope,
          executorVersion: options.executorVersion,
          grant: grantRecord?.grant,
          mode: options.mode,
          now,
          policyVersion: options.policyVersion,
          remainingUses: 0
        });
        return { result: { claimed: false, decision, execution: structuredClone(execution), replayed: true }, state };
      }
      let authorityStatus: "exact" | "missing" | "corrupt" | "mismatch";
      try {
        authorityStatus = (await options.validateAuthority({
          envelope: execution.envelope,
          grant: grantRecord?.grant
        })).authorityStatus;
      } catch {
        authorityStatus = "corrupt";
      }
      const decision = evaluateProgressiveAutonomy({
        authorityStatus,
        envelope: execution.envelope,
        executorVersion: options.executorVersion,
        grant: grantRecord?.grant,
        grantStatus: grantRecord?.revokedAt ? "revoked" : "active",
        hardDeny: options.hardDeny,
        mode: options.mode,
        now,
        policyVersion: options.policyVersion,
        remainingUses: grantRecord ? grantRecord.grant.maxUses - grantRecord.usedCount : 0,
        veto: state.vetoes.some((veto) => veto.userId === execution.envelope.userId
          && veto.threadId === execution.envelope.threadId
          && veto.action === execution.envelope.action
          && sameLink(veto.link, execution.envelope.link))
      });
      const claimed = decision.enforcementDecision === "allow-standing";
      const updatedExecution: ProgressiveAutonomyExecution = claimed
        ? {
            ...execution,
            claimContext: {
              claimedAt: now.toISOString(),
              decision,
              executorVersion: options.executorVersion,
              hardDeny: false,
              mode: "live",
              policyVersion: options.policyVersion
            },
            executingAt: now.toISOString(),
            status: "executing"
          }
        : { ...execution, completedAt: now.toISOString(), reason: decision.rationale, status: "failed" };
      return {
        result: { claimed, decision, execution: structuredClone(updatedExecution), replayed: false },
        state: {
          ...state,
          executions: state.executions.map((entry) => entry.executionId === executionId ? updatedExecution : entry),
          grants: claimed && grantRecord
            ? state.grants.map((entry) => entry.grant.id === grantRecord.grant.id
              ? { ...entry, usedCount: entry.usedCount + 1 }
              : entry)
            : state.grants,
          shadowReceipts: options.mode === "shadow"
            ? [...state.shadowReceipts, {
                enforcementDecision: decision.enforcementDecision,
                envelope: structuredClone(execution.envelope),
                executionId: execution.executionId,
                grantId: execution.grantId,
                id: `shadow:${execution.executionId}`,
                rationale: decision.rationale,
                recordedAt: now.toISOString(),
                shadowAssessment: decision.shadowAssessment,
                shadowRationale: decision.shadowRationale
              }]
            : state.shadowReceipts
        }
      };
    });
  }

  private async finishExecution(
    executionId: string,
    input: FinishProgressiveAutonomyExecutionInput
  ): Promise<ProgressiveAutonomyActionReceipt> {
    return this.mutate((state) => {
      const execution = state.executions.find((entry) => entry.executionId === executionId);
      if (!execution) throw new TypeError(`progressive autonomy execution '${executionId}' does not exist`);
      if (input.status === "succeeded"
        && input.observedAfterFingerprint !== execution.intendedAfterFingerprint) {
        throw new TypeError("succeeded execution requires exact intended after observation");
      }
      const existingReceipt = state.receipts.find((entry) => entry.executionId === executionId);
      if (existingReceipt) return { result: structuredClone(existingReceipt), state };
      if (execution.status !== "executing") {
        throw new TypeError("only a durable executing claim can be finalized");
      }
      const grant = state.grants.find((entry) => entry.grant.id === execution.grantId)?.grant;
      if (!grant) throw new ProgressiveAutonomyStoreCorruptError();
      const receipt: ProgressiveAutonomyActionReceipt = {
        beforeFingerprint: execution.beforeFingerprint,
        executionId,
        grant: structuredClone(grant),
        id: `receipt:${executionId}`,
        intendedAfterFingerprint: execution.intendedAfterFingerprint,
        link: structuredClone(execution.envelope.link),
        ...(input.observedAfterFingerprint
          ? { observedAfterFingerprint: input.observedAfterFingerprint }
          : {}),
        rationale: input.rationale,
        recordedAt: input.recordedAt,
        status: input.status,
        threadId: execution.envelope.threadId,
        traceId: execution.envelope.traceId
      };
      const finished: ProgressiveAutonomyExecution = {
        ...execution,
        completedAt: input.recordedAt,
        reason: input.rationale,
        status: input.status
      };
      return {
        result: structuredClone(receipt),
        state: {
          ...state,
          executions: state.executions.map((entry) => entry.executionId === executionId ? finished : entry),
          receipts: [...state.receipts, receipt]
        }
      };
    });
  }

  private async recordUndo(
    executionId: string,
    input: RecordProgressiveAutonomyUndoInput
  ): Promise<ProgressiveAutonomyUndoReceipt> {
    return this.mutate((state) => {
      const existing = state.undoReceipts.find((entry) => entry.executionId === executionId);
      if (existing) return { result: structuredClone(existing), state };
      const execution = state.executions.find((entry) => entry.executionId === executionId);
      const actionReceipt = state.receipts.find((entry) => entry.executionId === executionId);
      if (!execution || execution.status !== "undoing" || actionReceipt?.status !== "succeeded") {
        throw new TypeError("only a durable undo claim for an exact succeeded action can be finalized");
      }
      const receipt: ProgressiveAutonomyUndoReceipt = {
        actionReceiptId: actionReceipt.id,
        executionId,
        id: `undo:${executionId}`,
        intendedAfterFingerprint: execution.intendedAfterFingerprint,
        rationale: input.rationale,
        recordedAt: input.recordedAt,
        restoredFingerprint: input.restoredFingerprint,
        threadId: execution.envelope.threadId,
        traceId: execution.envelope.traceId
      };
      const undone: ProgressiveAutonomyExecution = {
        ...execution,
        completedAt: input.recordedAt,
        reason: input.rationale,
        status: "undone"
      };
      return {
        result: structuredClone(receipt),
        state: {
          ...state,
          executions: state.executions.map((entry) => entry.executionId === executionId ? undone : entry),
          undoReceipts: [...state.undoReceipts, receipt]
        }
      };
    });
  }

  private async claimUndo(
    executionId: string,
    options: ClaimProgressiveAutonomyUndoOptions
  ): Promise<ProgressiveAutonomyUndoClaimResult> {
    return this.mutate<ProgressiveAutonomyUndoClaimResult>(async (state) => {
      const execution = state.executions.find((entry) => entry.executionId === executionId);
      if (!execution) throw new TypeError(`progressive autonomy execution '${executionId}' does not exist`);
      const actionReceipt = state.receipts.find((entry) => entry.executionId === executionId);
      const replayed = execution.status === "undoing" || execution.status === "undone";
      if (execution.status === "undone") {
        return { result: { claimed: false, execution: structuredClone(execution), replayed: true }, state };
      }
      if ((execution.status !== "succeeded" && execution.status !== "undoing")
        || actionReceipt?.status !== "succeeded") {
        return {
          result: {
            claimed: false,
            execution: structuredClone(execution),
            reason: "only a succeeded recorded action can be undone",
            replayed
          },
          state
        };
      }
      let currentState: "exact-after" | "before" | "mismatch";
      try {
        currentState = await options.validateCurrentState();
      } catch {
        currentState = "mismatch";
      }
      if (currentState === "mismatch" || (execution.status === "succeeded" && currentState !== "exact-after")) {
        return {
          result: {
            claimed: false,
            execution: structuredClone(execution),
            reason: "current task differs from the exact recorded after-state; refusing undo",
            replayed
          },
          state
        };
      }
      const undoing: ProgressiveAutonomyExecution = execution.status === "undoing"
        ? execution
        : { ...execution, status: "undoing" };
      return {
        result: { claimed: true, execution: structuredClone(undoing), replayed },
        state: execution.status === "undoing"
          ? state
          : {
              ...state,
              executions: state.executions.map((entry) => entry.executionId === executionId ? undoing : entry)
            }
      };
    });
  }

  async revokeGrant(
    authorization: unknown,
    grantId: string,
    options: { readonly now?: () => Date } = {}
  ): Promise<StandingGrantRecord> {
    return this.mutate(async (state) => {
      const record = state.grants.find((entry) => entry.grant.id === grantId);
      if (!record) throw new TypeError(`standing grant '${grantId}' does not exist`);
      await this.assertUserAuthorization(authorization, record.grant.userId);
      const revoked = record.revokedAt
        ? record
        : { ...record, revokedAt: (options.now ?? (() => new Date()))().toISOString() };
      return {
        result: structuredClone(revoked),
        state: {
          ...state,
          grants: state.grants.map((entry) => entry.grant.id === grantId ? revoked : entry)
        }
      };
    });
  }

  async recordVeto(
    authorization: unknown,
    input: StandingGrantVetoInput,
    options: StandingGrantIssueOptions = {}
  ): Promise<StandingGrantVeto> {
    await this.assertUserAuthorization(authorization, input.userId);
    const id = (options.idFactory ?? randomUUID)().trim();
    if (id.length === 0) throw new TypeError("veto id must not be blank");
    const veto: StandingGrantVeto = {
      ...structuredClone(input),
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
      id,
      issuedBy: "user"
    };
    return this.mutate((state) => {
      if (state.vetoes.some((entry) => entry.id === veto.id)) {
        throw new TypeError(`standing veto '${veto.id}' already exists`);
      }
      return {
        result: structuredClone(veto),
        state: { ...state, vetoes: [...state.vetoes, veto] }
      };
    });
  }

  private async assertUserAuthorization(authorization: unknown, userId: string): Promise<void> {
    if (!await this.verifyUserAuthorization(authorization, userId)) {
      throw new TypeError("standing grant administration requires trusted user authorization");
    }
  }

  private async mutate<Result>(
    change: (state: ProgressiveAutonomyState) =>
      { readonly result: Result; readonly state: ProgressiveAutonomyState }
      | Promise<{ readonly result: Result; readonly state: ProgressiveAutonomyState }>
  ): Promise<Result> {
    await fs.mkdir(dirname(this.file), { recursive: true });
    return withFileMutationQueue(this.file, () => withFileLock(this.file, async () => {
      const state = await this.read();
      const mutation = await change(state);
      let candidate: ProgressiveAutonomyState;
      try {
        candidate = parseState(mutation.state);
      } catch (error) {
        if (error instanceof ProgressiveAutonomyStoreCorruptError) {
          throw new TypeError("invalid progressive autonomy state; refusing write", { cause: error });
        }
        throw error;
      }
      await this.write(candidate);
      return mutation.result;
    }));
  }

  private async read(): Promise<ProgressiveAutonomyState> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) return emptyState();
      throw error;
    }
    try {
      return parseState(JSON.parse(raw) as unknown);
    } catch (error) {
      if (error instanceof ProgressiveAutonomyStoreCorruptError) throw error;
      throw new ProgressiveAutonomyStoreCorruptError();
    }
  }

  private async write(state: ProgressiveAutonomyState): Promise<void> {
    await atomicWriteFile(this.file, `${JSON.stringify(state, null, 2)}\n`);
    await fs.chmod(this.file, 0o600);
  }
}

function emptyState(): ProgressiveAutonomyState {
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

function parseState(value: unknown): ProgressiveAutonomyState {
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

function sameLink(left: StandingGrantVeto["link"], right: StandingGrantVeto["link"]): boolean {
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

function isNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}
