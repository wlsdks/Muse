import { createHash } from "node:crypto";

export const COMPLETE_LINKED_NEXT_STEP_ACTION = "muse.tasks.complete-linked-next-step" as const;
export const PROGRESSIVE_AUTONOMY_SCHEMA_VERSION = 1 as const;

export interface LocalTaskNextStepLinkFingerprint {
  readonly artifactType: "task";
  readonly linkedAt: string;
  readonly providerId: "local";
  readonly role: "next-step";
  readonly taskId: string;
}

export interface OpenToDoneTransition {
  readonly from: "open";
  readonly to: "done";
}

export interface ProgressiveAutonomyActionEnvelope {
  readonly action: string;
  readonly idempotencyKey: string;
  readonly link: LocalTaskNextStepLinkFingerprint;
  readonly schemaVersion: typeof PROGRESSIVE_AUTONOMY_SCHEMA_VERSION;
  readonly threadId: string;
  readonly traceId: string;
  readonly transition: OpenToDoneTransition;
  readonly userId: string;
}

export interface StandingGrant {
  readonly action: typeof COMPLETE_LINKED_NEXT_STEP_ACTION;
  readonly executorVersion: number;
  readonly expiresAt: string;
  readonly id: string;
  readonly issuedAt: string;
  readonly issuedBy: "user";
  readonly link: LocalTaskNextStepLinkFingerprint;
  readonly maxUses: number;
  readonly policyVersion: number;
  readonly schemaVersion: typeof PROGRESSIVE_AUTONOMY_SCHEMA_VERSION;
  readonly threadId: string;
  readonly transition: OpenToDoneTransition;
  readonly userId: string;
}

export type StandingGrantInput = Omit<StandingGrant, "id" | "issuedAt" | "issuedBy">;

export interface StandingGrantIssueOptions {
  readonly idFactory?: () => string;
  readonly now?: () => Date;
}

export interface StandingGrantRecord {
  readonly grant: StandingGrant;
  readonly revokedAt?: string;
  readonly usedCount: number;
}

export interface LocalTaskSnapshot {
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly dueAt?: string;
  readonly id: string;
  readonly notes?: string;
  readonly proactive?: boolean;
  readonly status: "open" | "done";
  readonly tags?: readonly string[];
  readonly title: string;
  readonly urgent?: boolean;
}

export function fingerprintLocalTaskSnapshot(task: LocalTaskSnapshot): string {
  return createHash("sha256").update(JSON.stringify(task)).digest("hex");
}

export type ProgressiveAutonomyExecutionStatus =
  | "prepared"
  | "executing"
  | "succeeded"
  | "failed"
  | "unknown"
  | "undoing"
  | "undone";

export interface PrepareProgressiveAutonomyExecutionInput {
  readonly before: LocalTaskSnapshot;
  readonly beforeFingerprint: string;
  readonly envelope: ProgressiveAutonomyActionEnvelope;
  readonly executionId: string;
  readonly grantId: string;
  readonly intendedAfter: LocalTaskSnapshot;
  readonly intendedAfterFingerprint: string;
  readonly preparedAt: string;
}

export interface ProgressiveAutonomyExecution extends PrepareProgressiveAutonomyExecutionInput {
  readonly claimContext?: ProgressiveAutonomyClaimContext;
  readonly completedAt?: string;
  readonly executingAt?: string;
  readonly reason?: string;
  readonly status: ProgressiveAutonomyExecutionStatus;
}

export interface ProgressiveAutonomyClaimContext {
  readonly claimedAt: string;
  readonly decision: ProgressiveAutonomyDecision;
  readonly executorVersion: number;
  readonly hardDeny: false;
  readonly mode: "live";
  readonly policyVersion: number;
}

export interface ProgressiveAutonomyAuthorityValidation {
  readonly authorityStatus: "exact" | "missing" | "corrupt" | "mismatch";
}

export interface ClaimProgressiveAutonomyExecutionOptions {
  readonly executorVersion: number;
  readonly hardDeny?: boolean;
  readonly mode: "live" | "shadow";
  readonly now?: () => Date;
  readonly policyVersion: number;
  readonly validateAuthority: (input: {
    readonly envelope: ProgressiveAutonomyActionEnvelope;
    readonly grant?: StandingGrant;
  }) => Promise<ProgressiveAutonomyAuthorityValidation>;
}

export interface ProgressiveAutonomyClaimResult {
  readonly claimed: boolean;
  readonly decision: ProgressiveAutonomyDecision;
  readonly execution: ProgressiveAutonomyExecution;
  readonly replayed: boolean;
}

export interface ProgressiveAutonomyShadowReceipt {
  readonly enforcementDecision: ProgressiveAutonomyEnforcementDecision;
  readonly envelope: ProgressiveAutonomyActionEnvelope;
  readonly executionId: string;
  readonly grantId: string;
  readonly id: string;
  readonly rationale: string;
  readonly recordedAt: string;
  readonly shadowAssessment: ProgressiveAutonomyShadowAssessment;
  readonly shadowRationale: string;
}

export interface FinishProgressiveAutonomyExecutionInput {
  readonly observedAfterFingerprint?: string;
  readonly rationale: string;
  readonly recordedAt: string;
  readonly status: "succeeded" | "failed" | "unknown";
}

export interface ProgressiveAutonomyActionReceipt {
  readonly beforeFingerprint: string;
  readonly executionId: string;
  readonly grant: StandingGrant;
  readonly id: string;
  readonly intendedAfterFingerprint: string;
  readonly link: LocalTaskNextStepLinkFingerprint;
  readonly observedAfterFingerprint?: string;
  readonly rationale: string;
  readonly recordedAt: string;
  readonly status: "succeeded" | "failed" | "unknown";
  readonly threadId: string;
  readonly traceId: string;
}

export interface RecordProgressiveAutonomyUndoInput {
  readonly rationale: string;
  readonly recordedAt: string;
  readonly restoredFingerprint: string;
}

export type ProgressiveAutonomyUndoState = "exact-after" | "before" | "mismatch";

export interface ClaimProgressiveAutonomyUndoOptions {
  readonly validateCurrentState: () => Promise<ProgressiveAutonomyUndoState>;
}

export interface ProgressiveAutonomyUndoClaimResult {
  readonly claimed: boolean;
  readonly execution: ProgressiveAutonomyExecution;
  readonly reason?: string;
  readonly replayed: boolean;
}

export interface ProgressiveAutonomyUndoReceipt {
  readonly actionReceiptId: string;
  readonly executionId: string;
  readonly id: string;
  readonly intendedAfterFingerprint: string;
  readonly rationale: string;
  readonly recordedAt: string;
  readonly restoredFingerprint: string;
  readonly threadId: string;
  readonly traceId: string;
}

export interface StandingGrantVetoInput {
  readonly action: typeof COMPLETE_LINKED_NEXT_STEP_ACTION;
  readonly link: LocalTaskNextStepLinkFingerprint;
  readonly threadId: string;
  readonly userId: string;
}

export interface StandingGrantVeto extends StandingGrantVetoInput {
  readonly createdAt: string;
  readonly id: string;
  readonly issuedBy: "user";
}

export type VerifyStandingGrantUserAuthorization = (
  authorization: unknown,
  userId: string
) => boolean | Promise<boolean>;

export interface ProgressiveAutonomyExecutorStore {
  claimUndo(
    executionId: string,
    options: ClaimProgressiveAutonomyUndoOptions
  ): Promise<ProgressiveAutonomyUndoClaimResult>;
  claimExecution(
    executionId: string,
    options: ClaimProgressiveAutonomyExecutionOptions
  ): Promise<ProgressiveAutonomyClaimResult>;
  finishExecution(
    executionId: string,
    input: FinishProgressiveAutonomyExecutionInput
  ): Promise<ProgressiveAutonomyActionReceipt>;
  getExecution(executionId: string): Promise<ProgressiveAutonomyExecution | undefined>;
  getGrant(grantId: string): Promise<StandingGrantRecord | undefined>;
  listActionReceipts(): Promise<readonly ProgressiveAutonomyActionReceipt[]>;
  listShadowReceipts(): Promise<readonly ProgressiveAutonomyShadowReceipt[]>;
  listUndoReceipts(): Promise<readonly ProgressiveAutonomyUndoReceipt[]>;
  prepareExecution(input: PrepareProgressiveAutonomyExecutionInput): Promise<ProgressiveAutonomyExecution>;
  recordUndo(
    executionId: string,
    input: RecordProgressiveAutonomyUndoInput
  ): Promise<ProgressiveAutonomyUndoReceipt>;
}

export interface ProgressiveAutonomyAdminStore {
  executorStore(): ProgressiveAutonomyExecutorStore;
  issueGrant(
    authorization: unknown,
    input: StandingGrantInput,
    options?: StandingGrantIssueOptions
  ): Promise<StandingGrant>;
  recordVeto(
    authorization: unknown,
    input: StandingGrantVetoInput,
    options?: StandingGrantIssueOptions
  ): Promise<StandingGrantVeto>;
  revokeGrant(
    authorization: unknown,
    grantId: string,
    options?: { readonly now?: () => Date }
  ): Promise<StandingGrantRecord>;
}

export function validateStandingGrantInput(input: StandingGrantInput, now: Date): void {
  validateGrantInput(input, now);
}

export type ProgressiveAutonomyEnforcementDecision = "deny" | "confirm" | "allow-standing";
export type ProgressiveAutonomyShadowAssessment = "wouldDeny" | "wouldConfirm" | "wouldAllowStanding";

export interface ProgressiveAutonomyDecision {
  readonly enforcementDecision: ProgressiveAutonomyEnforcementDecision;
  readonly rationale: string;
  readonly shadowAssessment: ProgressiveAutonomyShadowAssessment;
  readonly shadowRationale: string;
}

export interface EvaluateProgressiveAutonomyInput {
  readonly authorityStatus?: "exact" | "missing" | "corrupt" | "mismatch";
  readonly envelope: ProgressiveAutonomyActionEnvelope;
  readonly executorVersion: number;
  readonly grant?: StandingGrant;
  readonly grantStatus?: "active" | "revoked" | "corrupt";
  readonly hardDeny?: boolean;
  readonly mode: "live" | "shadow";
  readonly now: Date;
  readonly policyVersion: number;
  readonly remainingUses: number;
  readonly veto?: boolean;
}

export function evaluateProgressiveAutonomy(input: EvaluateProgressiveAutonomyInput): ProgressiveAutonomyDecision {
  const denial = denialRationale(input);
  if (denial) {
    return {
      enforcementDecision: "deny",
      rationale: denial,
      shadowAssessment: "wouldDeny",
      shadowRationale: denial
    };
  }
  const exact = input.grant !== undefined
    && (input.grantStatus === undefined || input.grantStatus === "active")
    && input.grant.schemaVersion === input.envelope.schemaVersion
    && input.grant.action === input.envelope.action
    && input.grant.userId === input.envelope.userId
    && input.grant.threadId === input.envelope.threadId
    && sameLink(input.grant.link, input.envelope.link)
    && input.grant.transition.from === input.envelope.transition.from
    && input.grant.transition.to === input.envelope.transition.to
    && input.grant.policyVersion === input.policyVersion
    && input.grant.executorVersion === input.executorVersion
    && Date.parse(input.grant.expiresAt) > input.now.getTime()
    && input.remainingUses > 0;
  const shadowAssessment = exact ? "wouldAllowStanding" : "wouldConfirm";
  const shadowRationale = exact ? "exact active standing grant" : "no exact active standing grant";

  return {
    enforcementDecision: input.mode === "live" && exact ? "allow-standing" : "confirm",
    rationale: input.mode === "live" && exact ? "exact active standing grant" : "explicit confirmation required",
    shadowAssessment,
    shadowRationale
  };
}

function denialRationale(input: EvaluateProgressiveAutonomyInput): string | undefined {
  if (input.hardDeny === true) return "hard deny";
  if (input.veto === true) return "active user veto";
  if (input.authorityStatus === "missing" || input.authorityStatus === "corrupt" || input.authorityStatus === "mismatch") {
    return "exact current link authority is unavailable";
  }
  if (input.grantStatus === "corrupt") return "standing grant authority is corrupt";
  if (input.envelope.action !== COMPLETE_LINKED_NEXT_STEP_ACTION
    || input.envelope.schemaVersion !== PROGRESSIVE_AUTONOMY_SCHEMA_VERSION) {
    return "unsupported progressive autonomy action";
  }
  return undefined;
}

function sameLink(left: LocalTaskNextStepLinkFingerprint, right: LocalTaskNextStepLinkFingerprint): boolean {
  return left.artifactType === right.artifactType
    && left.linkedAt === right.linkedAt
    && left.providerId === right.providerId
    && left.role === right.role
    && left.taskId === right.taskId;
}

function validateGrantInput(input: StandingGrantInput, now: Date): void {
  if (input.schemaVersion !== PROGRESSIVE_AUTONOMY_SCHEMA_VERSION
    || input.action !== COMPLETE_LINKED_NEXT_STEP_ACTION
    || input.link.providerId !== "local"
    || input.link.artifactType !== "task"
    || input.link.role !== "next-step"
    || input.transition.from !== "open"
    || input.transition.to !== "done") {
    throw new TypeError("standing grant scope is not supported");
  }
  nonBlank(input.userId, "grant userId");
  nonBlank(input.threadId, "grant threadId");
  nonBlank(input.link.taskId, "grant taskId");
  if (!Number.isSafeInteger(input.maxUses) || input.maxUses < 1
    || !Number.isSafeInteger(input.policyVersion) || input.policyVersion < 1
    || !Number.isSafeInteger(input.executorVersion) || input.executorVersion < 1
    || !Number.isFinite(Date.parse(input.link.linkedAt))
    || !Number.isFinite(Date.parse(input.expiresAt))
    || Date.parse(input.expiresAt) <= now.getTime()) {
    throw new TypeError("standing grant bounds are invalid");
  }
}

function nonBlank(value: string, field: string): void {
  if (value.trim().length === 0) throw new TypeError(`${field} must not be blank`);
}
