import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  evaluateProgressiveAutonomy,
  validateStandingGrantInput,
  type ClaimProgressiveAutonomyExecutionOptions,
  type ClaimProgressiveAutonomyUndoOptions,
  type FinishProgressiveAutonomyExecutionInput,
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
export { ProgressiveAutonomyStoreCorruptError } from "./progressive-autonomy-state.js";

import {
  ProgressiveAutonomyStoreCorruptError,
  emptyState,
  isNodeErrorCode,
  parseState,
  sameLink,
  type ProgressiveAutonomyState
} from "./progressive-autonomy-state.js";


export interface FileProgressiveAutonomyAdminStoreOptions {
  readonly file: string;
  readonly verifyUserAuthorization: VerifyStandingGrantUserAuthorization;
}

/** Host-composition read capability for runtime policy assessment; exposes no authority mutations. */
export class FileProgressiveAutonomyAuthorityReader {
  private readonly store: FileProgressiveAutonomyAdminStore;

  constructor(options: { readonly file: string }) {
    this.store = new FileProgressiveAutonomyAdminStore({
      file: options.file,
      verifyUserAuthorization: () => false
    });
  }

  listGrantRecords(): Promise<readonly StandingGrantRecord[]> {
    return this.store.listGrantRecords();
  }
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

