import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { readAttunementState, type AttunementState } from "@muse/attunement";
import {
  inspectBeliefProvenanceSource,
  reviveUserModelSlotDates,
  selectReconfirmableSlots,
  type BeliefProvenance,
  type UserMemory,
  type UserMemoryStore
} from "@muse/memory";
import { inspectPendingApprovalsSource } from "@muse/messaging";
import { inspectResidentDaemon, type ResidentDaemonInspection } from "@muse/runtime-state";
import {
  buildPersonalStatus,
  type PersonalStatusCard,
  type PersonalStatusResponse,
  type PersonalStatusSource,
  type ReadOnlySourceFailure,
  type ReadOnlySourceInspection
} from "@muse/shared";
import { inspectProposedActionsSource, inspectVetoesSource } from "@muse/stores";
import type { FastifyInstance } from "fastify";

import { requireAuthenticated } from "./server-helpers.js";
import type { ServerOptions } from "./server-options.js";

type Environment = Readonly<Record<string, string | undefined>>;

export interface PersonalStatusRoutesOptions {
  readonly authService: ServerOptions["authService"];
  readonly attunementFile: string;
  readonly beliefProvenanceFile: string;
  readonly defaultUserId: string;
  readonly env: Environment;
  readonly now?: () => Date;
  readonly pendingApprovalsFile: string;
  readonly proposedActionsFile: string;
  readonly residentInspector?: () => Promise<ResidentDaemonInspection>;
  readonly userMemoryStore?: Pick<UserMemoryStore, "findByUserId">;
  readonly vetoesFile: string;
}

interface ProjectionContext {
  readonly generatedAt: string;
  readonly now: Date;
  readonly userId: string;
}

function canonicalAt(value: string, nowMs: number): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value && parsed.getTime() <= nowMs;
}

function text(value: string, max: number): string {
  const clean = value.replace(/[\x00-\x1f\x7f-\x9f]/gu, " ").replace(/\s+/gu, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function source(
  id: PersonalStatusSource["id"],
  generatedAt: string,
  result: PersonalStatusSource["result"],
  includedCount = 0,
  excludedCount = 0,
  errorCode?: PersonalStatusSource["errorCode"]
): PersonalStatusSource {
  return {
    excludedCount,
    id,
    includedCount,
    observedAt: generatedAt,
    result,
    ...(errorCode ? { errorCode } : {})
  };
}

function unavailable(
  sourceId: PersonalStatusSource["id"],
  kind: PersonalStatusCard["kind"],
  generatedAt: string,
  reason: string
): PersonalStatusCard {
  return {
    deadline: null,
    detail: "이 출처를 빈 상태로 추측하지 않았습니다. 원본을 확인한 뒤 다시 시도하세요.",
    id: `source:${sourceId}`,
    kind,
    observedAt: generatedAt,
    priority: 10,
    sourceId,
    status: "unavailable",
    title: "상태를 확인할 수 없음",
    unavailableReason: text(reason, 500)
  };
}

function failedSource(
  sourceId: PersonalStatusSource["id"],
  kind: PersonalStatusCard["kind"],
  generatedAt: string,
  failure: ReadOnlySourceFailure
): { readonly cards: readonly PersonalStatusCard[]; readonly row: PersonalStatusSource } {
  return {
    cards: [unavailable(sourceId, kind, generatedAt, `${sourceId}: ${failure.errorCode}`)],
    row: source(sourceId, generatedAt, failure.result, 0, 0, failure.errorCode)
  };
}

function projectPendingApprovals(
  inspected: Awaited<ReturnType<typeof inspectPendingApprovalsSource>>,
  context: ProjectionContext
): { readonly cards: readonly PersonalStatusCard[]; readonly row: PersonalStatusSource } {
  if (inspected.result !== "available") return failedSource("pending-approvals", "external-approval", context.generatedAt, inspected);
  let excluded = inspected.value.excludedCount;
  const cards: PersonalStatusCard[] = [];
  for (const approval of inspected.value.pending) {
    if (approval.userId !== context.userId || !canonicalAt(approval.createdAt, context.now.getTime())
      || !canonicalAt(approval.expiresAt, Number.MAX_SAFE_INTEGER) || Date.parse(approval.expiresAt) <= context.now.getTime()) {
      excluded += 1;
      continue;
    }
    cards.push({
      action: { id: "review-approval", target: { itemId: approval.id, review: "approval", type: "local-review" } },
      deadline: new Date(approval.expiresAt).toISOString(),
      detail: text(`${approval.tool} · ${approval.risk} · 외부 실행 전 소유자 확인이 필요합니다.`, 500),
      id: `approval:${approval.id}`,
      kind: "external-approval",
      observedAt: new Date(approval.createdAt).toISOString(),
      priority: 20,
      sourceId: "pending-approvals",
      status: "attention",
      title: "승인 대기"
    });
  }
  return { cards, row: source("pending-approvals", context.generatedAt, "available", cards.length, excluded) };
}

function projectProposals(
  inspected: Awaited<ReturnType<typeof inspectProposedActionsSource>>,
  context: ProjectionContext
): { readonly cards: readonly PersonalStatusCard[]; readonly row: PersonalStatusSource } {
  if (inspected.result !== "available") return failedSource("proposed-actions", "external-proposal", context.generatedAt, inspected);
  let excluded = inspected.value.excludedCount;
  const cards: PersonalStatusCard[] = [];
  for (const proposal of inspected.value.proposals) {
    if (proposal.status !== "pending" || proposal.userId !== context.userId || proposal.expiresAt === undefined
      || !canonicalAt(proposal.createdAt, context.now.getTime()) || !canonicalAt(proposal.expiresAt, Number.MAX_SAFE_INTEGER)
      || Date.parse(proposal.expiresAt) <= context.now.getTime()) {
      excluded += 1;
      continue;
    }
    cards.push({
      action: { id: "show-proposal-command", target: { command: "muse propose list", type: "command" } },
      deadline: new Date(proposal.expiresAt).toISOString(),
      detail: text(proposal.reason, 500),
      id: `proposal:${proposal.id}`,
      kind: "external-proposal",
      observedAt: new Date(proposal.createdAt).toISOString(),
      priority: 20,
      sourceId: "proposed-actions",
      status: "attention",
      title: text(proposal.summary, 160) || "전송 제안"
    });
  }
  return { cards, row: source("proposed-actions", context.generatedAt, "available", cards.length, excluded) };
}

async function inspectAttunement(file: string): Promise<ReadOnlySourceInspection<AttunementState>> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (cause) {
    const code = cause && typeof cause === "object" ? (cause as { readonly code?: unknown }).code : undefined;
    if (code === "ENOENT") return { errorCode: "missing", result: "absent" };
    return { errorCode: code === "EACCES" || code === "EPERM" ? "permission-denied" : "io-error", result: "unreadable" };
  }
  try {
    JSON.parse(raw);
  } catch {
    return { errorCode: "invalid-json", result: "corrupt" };
  }
  try {
    return { result: "available", value: await readAttunementState(file) };
  } catch {
    return { errorCode: "invalid-schema", result: "corrupt" };
  }
}

function projectAttunement(
  inspected: ReadOnlySourceInspection<AttunementState>,
  context: ProjectionContext
): { readonly cards: readonly PersonalStatusCard[]; readonly row: PersonalStatusSource } {
  if (inspected.result !== "available") return failedSource("attunement", "continuity-feedback", context.generatedAt, inspected);
  const state = inspected.value;
  let excluded = 0;
  const cards: PersonalStatusCard[] = [];
  const orderedDeliveries = state.deliveries.slice().sort((left, right) => left.openedAt.localeCompare(right.openedAt));
  const eligible = orderedDeliveries.filter((delivery) => delivery.evidenceClass === "organic").slice(0, 20);
  const next = eligible.find((delivery) => delivery.outcome?.evidenceClass !== "organic");
  if (next && canonicalAt(next.openedAt, context.now.getTime())) {
    const thread = state.threads.find((candidate) => candidate.id === next.threadId);
    if (thread) {
      cards.push({
        action: { id: "review-continuity-feedback", target: { focus: "continuity-feedback-review", type: "view", view: "continuity" } },
        deadline: null,
        detail: next.outcome ? "기존 기술용 피드백은 개인 효과 근거가 아니므로 별도 검토가 필요합니다." : "실제 생활·업무 결과를 소유자가 직접 남길 차례입니다.",
        id: `feedback:${next.id}`,
        kind: "continuity-feedback",
        observedAt: new Date(next.openedAt).toISOString(),
        priority: next.outcome ? 35 : 30,
        sourceId: "attunement",
        status: next.outcome ? "held" : "attention",
        title: text(thread.title, 160)
      });
    } else excluded += 1;
  } else if (next) excluded += 1;
  for (const thread of state.threads) {
    if (thread.links.length === 0 || !canonicalAt(thread.createdAt, context.now.getTime())) { excluded += 1; continue; }
    cards.push({
      action: { id: "open-continuity", target: { type: "view", view: "continuity" } },
      deadline: null,
      detail: `${thread.kind === "work" ? "업무" : "생활"} 흐름 · 연결 ${thread.links.length.toString()}개`,
      id: `thread:${thread.id}`,
      kind: "continuity-thread",
      observedAt: new Date(thread.createdAt).toISOString(),
      priority: 50,
      sourceId: "attunement",
      status: "ready",
      title: text(thread.title, 160)
    });
  }
  return { cards, row: source("attunement", context.generatedAt, "available", cards.length, excluded) };
}

function currentValue(memory: UserMemory, entry: BeliefProvenance): string | undefined {
  return entry.kind === "fact" ? memory.facts[entry.key] : memory.preferences[entry.key];
}

function projectLearning(
  inspected: Awaited<ReturnType<typeof inspectBeliefProvenanceSource>>,
  memory: UserMemory | undefined,
  memoryFailure: ReadOnlySourceFailure | undefined,
  context: ProjectionContext
): { readonly cards: readonly PersonalStatusCard[]; readonly rows: readonly PersonalStatusSource[] } {
  if (memoryFailure) {
    const failed = failedSource("user-memory", "learning-change", context.generatedAt, memoryFailure);
    const provenance = inspected.result === "available"
      ? { cards: [] as readonly PersonalStatusCard[], row: source("belief-provenance", context.generatedAt, "available", 0, inspected.value.entries.length + inspected.value.excludedCount) }
      : failedSource("belief-provenance", "learning-change", context.generatedAt, inspected);
    return { cards: [...failed.cards, ...provenance.cards], rows: [failed.row, provenance.row] };
  }
  if (inspected.result !== "available") {
    const failed = failedSource("belief-provenance", "learning-change", context.generatedAt, inspected);
    return { cards: failed.cards, rows: [source("user-memory", context.generatedAt, "available", 0, 0), failed.row] };
  }
  let excluded = inspected.value.excludedCount;
  const latest = new Map<string, { readonly entry: BeliefProvenance; readonly index: number }>();
  inspected.value.entries.forEach((entry, index) => {
    if (entry.userId !== context.userId || !canonicalAt(entry.learnedAt, context.now.getTime())) { excluded += 1; return; }
    const id = `${entry.kind}:${entry.key}`;
    const previous = latest.get(id);
    if (!previous || entry.learnedAt > previous.entry.learnedAt || (entry.learnedAt === previous.entry.learnedAt && index > previous.index)) {
      latest.set(id, { entry, index });
    }
  });
  const cards: PersonalStatusCard[] = [];
  const cutoff = context.now.getTime() - 30 * 86_400_000;
  for (const { entry } of latest.values()) {
    const autoEvidenceValid = entry.source !== "auto" || (Boolean(entry.sessionId?.trim()) && Boolean(entry.evidenceExcerpt?.trim()));
    if (entry.retraction === true || (entry.source !== "user" && entry.source !== "auto") || !autoEvidenceValid
      || currentValue(memory!, entry) !== entry.value || Date.parse(entry.learnedAt) < cutoff) {
      excluded += 1;
      continue;
    }
    cards.push({
      action: { id: "open-learning-history", target: { focus: "learning-history", type: "view", view: "journey" } },
      deadline: null,
      detail: text(entry.source === "user" ? "사용자가 직접 말한 현재 기억" : `대화 근거: ${entry.evidenceExcerpt ?? ""}`, 500),
      id: `learning:${entry.kind}:${entry.key}`,
      kind: "learning-change",
      observedAt: new Date(entry.learnedAt).toISOString(),
      priority: 60,
      sourceId: "belief-provenance",
      status: "info",
      title: text(entry.key, 160)
    });
  }
  return {
    cards,
    rows: [
      source("user-memory", context.generatedAt, "available", cards.length, 0),
      source("belief-provenance", context.generatedAt, "available", cards.length, excluded)
    ]
  };
}

function projectReconfirmation(
  memory: UserMemory | undefined,
  failure: ReadOnlySourceFailure | undefined,
  context: ProjectionContext
): { readonly cards: readonly PersonalStatusCard[]; readonly row: PersonalStatusSource } {
  if (failure) return failedSource("reconfirmation", "learning-review", context.generatedAt, failure);
  const model = memory?.userModel ? reviveUserModelSlotDates(memory.userModel) : undefined;
  const top = model ? selectReconfirmableSlots(model, { now: context.now })[0] : undefined;
  if (!top || !canonicalAt(top.slot.updatedAt.toISOString(), context.now.getTime())) {
    return { cards: [], row: source("reconfirmation", context.generatedAt, "available", 0, top ? 1 : 0) };
  }
  const card: PersonalStatusCard = {
    action: { id: "review-learning", target: { focus: "memory-reconfirm", type: "local-focus" } },
    deadline: null,
    detail: "옅어진 추측을 계속 믿기 전에 확인하거나 지울 수 있습니다.",
    id: `learning-review:${top.slot.id}`,
    kind: "learning-review",
    observedAt: top.slot.updatedAt.toISOString(),
    priority: 40,
    sourceId: "reconfirmation",
    status: "attention",
    title: "기억 확인 필요"
  };
  return { cards: [card], row: source("reconfirmation", context.generatedAt, "available", 1, 0) };
}

function projectVetoes(
  inspected: Awaited<ReturnType<typeof inspectVetoesSource>>,
  context: ProjectionContext
): { readonly cards: readonly PersonalStatusCard[]; readonly row: PersonalStatusSource } {
  if (inspected.result !== "available") return failedSource("vetoes", "veto", context.generatedAt, inspected);
  let excluded = inspected.value.excludedCount;
  const cards: PersonalStatusCard[] = [];
  for (const veto of inspected.value.vetoes) {
    if (veto.userId !== context.userId || !canonicalAt(veto.vetoedAt, context.now.getTime())) { excluded += 1; continue; }
    cards.push({
      action: { id: "open-vetoes", target: { focus: "vetoes", type: "view", view: "autonomy" } },
      deadline: null,
      detail: text(veto.reason ?? `${veto.objectiveId} · ${veto.scope}`, 500),
      id: `veto:${veto.id}`,
      kind: "veto",
      observedAt: new Date(veto.vetoedAt).toISOString(),
      priority: 60,
      sourceId: "vetoes",
      status: "info",
      title: text(`하지 않기 · ${veto.scope}`, 160)
    });
  }
  return { cards, row: source("vetoes", context.generatedAt, "available", cards.length, excluded) };
}

function projectRuntime(
  inspected: ResidentDaemonInspection,
  context: ProjectionContext
): { readonly cards: readonly PersonalStatusCard[]; readonly row: PersonalStatusSource } {
  if (inspected.observation.platform !== "darwin") {
    const failure = { errorCode: "platform-unsupported", result: "unsupported" } as const;
    return {
      cards: [unavailable("resident-runtime", "runtime-trust", context.generatedAt, "resident runtime platform unsupported")],
      row: source("resident-runtime", context.generatedAt, failure.result, 0, 0, failure.errorCode)
    };
  }
  const observation = inspected.observation;
  const verified = observation.artifact === "valid" && observation.runtime === "running" && observation.liveProbe === "ok"
    && observation.liveDefinitionMatches && observation.stableMuseCommand && observation.pidAgreement && observation.heartbeat === "fresh";
  const delivery = inspected.effectiveRuntimeEnv.MUSE_DAEMON_DELIVERY_ENABLED?.trim().toLowerCase();
  const brakeEngaged = delivery !== undefined && ["0", "false", "no", "off"].includes(delivery);
  const brakeReleased = delivery !== undefined && ["1", "true", "yes", "on"].includes(delivery);
  const held = !verified || brakeEngaged || !brakeReleased;
  const card: PersonalStatusCard = {
    action: { id: "inspect-runtime", target: { command: "muse daemon --status", type: "command" } },
    deadline: null,
    detail: held
      ? text(`runtime=${observation.runtime}, heartbeat=${observation.heartbeat}, delivery=${brakeEngaged ? "engaged" : brakeReleased ? "released" : "unknown"}`, 500)
      : "resident daemon과 delivery gate가 검증되었습니다.",
    id: "runtime:resident",
    kind: "runtime-trust",
    observedAt: context.generatedAt,
    priority: held ? 10 : 60,
    sourceId: "resident-runtime",
    status: held ? "held" : "info",
    title: held ? "백그라운드 도움 보류" : "백그라운드 도움 정상"
  };
  return { cards: [card], row: source("resident-runtime", context.generatedAt, "available", 1, 0) };
}

async function loadMemory(
  store: PersonalStatusRoutesOptions["userMemoryStore"],
  userId: string
): Promise<{ readonly memory?: UserMemory; readonly failure?: ReadOnlySourceFailure }> {
  if (!store) return { failure: { errorCode: "missing", result: "absent" } };
  try {
    return { memory: await Promise.resolve(store.findByUserId(userId)) };
  } catch {
    return { failure: { errorCode: "io-error", result: "unreadable" } };
  }
}

export async function collectPersonalStatus(options: PersonalStatusRoutesOptions): Promise<PersonalStatusResponse> {
  const now = options.now?.() ?? new Date();
  const context: ProjectionContext = { generatedAt: now.toISOString(), now, userId: options.defaultUserId };
  const [runtime, approvals, proposals, attunement, provenance, memoryResult, vetoes] = await Promise.all([
    options.residentInspector?.() ?? inspectResidentDaemon({ env: { ...options.env }, inspectOrphans: false }),
    inspectPendingApprovalsSource(options.pendingApprovalsFile),
    inspectProposedActionsSource(options.proposedActionsFile),
    inspectAttunement(options.attunementFile),
    inspectBeliefProvenanceSource(options.beliefProvenanceFile, { ...options.env }),
    loadMemory(options.userMemoryStore, context.userId),
    inspectVetoesSource(options.vetoesFile)
  ]);
  const projectedRuntime = projectRuntime(runtime, context);
  const projectedApprovals = projectPendingApprovals(approvals, context);
  const projectedProposals = projectProposals(proposals, context);
  const projectedAttunement = projectAttunement(attunement, context);
  const projectedLearning = projectLearning(provenance, memoryResult.memory, memoryResult.failure, context);
  const projectedReconfirmation = projectReconfirmation(memoryResult.memory, memoryResult.failure, context);
  const projectedVetoes = projectVetoes(vetoes, context);
  const rows = [
    projectedRuntime.row,
    projectedApprovals.row,
    projectedProposals.row,
    projectedAttunement.row,
    ...projectedLearning.rows,
    projectedReconfirmation.row,
    projectedVetoes.row
  ];
  const status = buildPersonalStatus({
    cards: [
      ...projectedRuntime.cards,
      ...projectedApprovals.cards,
      ...projectedProposals.cards,
      ...projectedAttunement.cards,
      ...projectedLearning.cards,
      ...projectedReconfirmation.cards,
      ...projectedVetoes.cards
    ],
    generatedAt: context.generatedAt,
    sources: rows
  });
  const countedRows = rows.map((row): PersonalStatusSource => {
    if (row.result !== "available") return row;
    const includedCount = status.cards.filter((card) => card.sourceId === row.id).length;
    return {
      ...row,
      excludedCount: row.excludedCount + Math.max(0, row.includedCount - includedCount),
      includedCount
    };
  });
  return buildPersonalStatus({ cards: status.cards, generatedAt: context.generatedAt, sources: countedRows });
}

export function registerPersonalStatusRoutes(server: FastifyInstance, options: PersonalStatusRoutesOptions): void {
  server.get("/api/personal-status", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(options.authService))) return reply;
    if (request.query && typeof request.query === "object" && Object.keys(request.query).length > 0) {
      return reply.status(400).send({ error: "personal status does not accept query identity or filters" });
    }
    return collectPersonalStatus(options);
  });
}

export function resolveProposedActionsStatusFile(env: Environment): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || homedir();
  return env.MUSE_PROPOSED_ACTIONS_FILE?.trim() || join(home, ".muse", "proposed-actions.json");
}
