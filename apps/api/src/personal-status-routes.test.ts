import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPersonalThread, linkArtifact } from "@muse/attunement";
import type { UserMemory } from "@muse/memory";
import type { ResidentDaemonInspection } from "@muse/runtime-state";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { collectPersonalStatus, registerPersonalStatusRoutes, type PersonalStatusRoutesOptions } from "./personal-status-routes.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const USER_ID = "owner";

function resident(delivery = "false"): ResidentDaemonInspection {
  return {
    effectiveRuntimeEnv: { HOME: "/isolated", MUSE_DAEMON_DELIVERY_ENABLED: delivery },
    observation: {
      artifact: "valid",
      autostartProbe: "ok",
      heartbeat: "fresh",
      liveDefinitionMatches: true,
      liveProbe: "ok",
      orphanProbe: "ok",
      orphanProcessCount: 0,
      orphanRootCount: 0,
      pidAgreement: true,
      platform: "darwin",
      runtime: "running",
      stableMuseCommand: true
    }
  };
}

function fingerprint(file: string): string {
  const stat = statSync(file);
  return `${stat.size.toString()}:${stat.mode.toString()}:${stat.mtimeMs.toString()}:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

async function fixture(options: { readonly provenance?: readonly Record<string, unknown>[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "muse-personal-status-"));
  const files = {
    approvals: join(root, "pending-approvals.json"),
    attunement: join(root, "attunement.json"),
    provenance: join(root, "belief-provenance.json"),
    proposals: join(root, "proposed-actions.json"),
    vetoes: join(root, "vetoes.json")
  };
  mkdirSync(root, { recursive: true });
  writeFileSync(files.approvals, JSON.stringify({ pending: [
    {
      arguments: {}, createdAt: "2026-07-22T11:00:00.000Z", draft: "private draft", expiresAt: "2026-07-22T13:00:00.000Z",
      id: "approval_owner", providerId: "telegram", risk: "execute", source: "chat", tool: "send_message", userId: USER_ID
    },
    {
      arguments: {}, createdAt: "2026-07-22T11:00:00.000Z", draft: "other", expiresAt: "2026-07-22T13:00:00.000Z",
      id: "approval_other", providerId: "telegram", risk: "execute", source: "chat", tool: "send_message", userId: "other"
    }
  ] }));
  writeFileSync(files.proposals, JSON.stringify({ proposals: [
    {
      createdAt: "2026-07-22T11:10:00.000Z", destination: "private", expiresAt: "2026-07-22T14:00:00.000Z", id: "proposal_owner",
      kind: "message", providerId: "telegram", reason: "약속한 후속 연락", status: "pending", summary: "후속 연락 초안", text: "private", userId: USER_ID
    },
    {
      createdAt: "2026-07-22T11:10:00.000Z", destination: "private", expiresAt: NOW.toISOString(), id: "proposal_equal_expiry",
      kind: "message", providerId: "telegram", reason: "expired", status: "pending", summary: "expired", text: "private", userId: USER_ID
    }
  ] }));
  writeFileSync(files.provenance, JSON.stringify({ entries: options.provenance ?? [
    {
      evidenceExcerpt: "나는 아침에 집중이 잘 돼", key: "focus_time", kind: "preference", learnedAt: "2026-07-21T08:00:00.000Z",
      sessionId: "session_1", source: "auto", userId: USER_ID, value: "morning"
    }
  ] }));
  writeFileSync(files.vetoes, JSON.stringify({ vetoes: [
    { id: "veto_1", objectiveId: "followup", reason: "먼저 묻기", scope: "messaging", userId: USER_ID, vetoedAt: "2026-07-20T09:00:00.000Z" }
  ] }));
  const thread = await createPersonalThread(files.attunement, { kind: "work", title: "출시 준비" }, {
    idFactory: () => "thread_1",
    now: () => new Date("2026-07-21T09:00:00.000Z")
  });
  await linkArtifact(files.attunement, {
    artifactId: "task_1", artifactType: "task", role: "next-step", threadId: thread.id
  }, {
    now: () => new Date("2026-07-21T09:01:00.000Z"),
    validateArtifact: async (input) => input
  });
  const attunement = JSON.parse(readFileSync(files.attunement, "utf8")) as { deliveries: unknown[] };
  attunement.deliveries.push({
    evidenceClass: "organic", evidenceRefs: [], id: "delivery_1", openedAt: "2026-07-22T10:00:00.000Z", policyVersion: 0, threadId: thread.id
  });
  writeFileSync(files.attunement, `${JSON.stringify(attunement, null, 2)}\n`);
  const memory: UserMemory = {
    facts: {},
    preferences: { focus_time: "morning" },
    recentTopics: [],
    updatedAt: NOW,
    userId: USER_ID
  };
  const findByUserId = vi.fn(async () => memory);
  const routeOptions: PersonalStatusRoutesOptions = {
    attunementFile: files.attunement,
    authService: undefined,
    beliefProvenanceFile: files.provenance,
    defaultUserId: USER_ID,
    env: { HOME: root },
    now: () => NOW,
    pendingApprovalsFile: files.approvals,
    proposedActionsFile: files.proposals,
    residentInspector: async () => resident(),
    userMemoryStore: { findByUserId },
    vetoesFile: files.vetoes
  };
  return { files, findByUserId, root, routeOptions };
}

describe("GET /api/personal-status", () => {
  it("projects owner-scoped actionable cards without changing any backing source", async () => {
    const state = await fixture();
    const before = {
      entries: readdirSync(state.root).sort(),
      files: Object.fromEntries(Object.entries(state.files).map(([key, file]) => [key, fingerprint(file)]))
    };
    const server = Fastify();
    registerPersonalStatusRoutes(server, state.routeOptions);
    const response = await server.inject({ method: "GET", url: "/api/personal-status" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(["cards", "generatedAt", "overall", "schemaVersion", "sources"]);
    expect(body).toMatchObject({ generatedAt: NOW.toISOString(), overall: "held", schemaVersion: "muse.personal-status/v1" });
    expect(body.cards.map((card: { readonly id: string }) => card.id)).toEqual(expect.arrayContaining([
      "runtime:resident", "approval:approval_owner", "proposal:proposal_owner", "feedback:delivery_1",
      "thread:thread_thread_1", "learning:preference:focus_time", "veto:veto_1"
    ]));
    expect(body.cards.some((card: { readonly id: string }) => card.id === "approval:approval_other")).toBe(false);
    expect(body.cards.some((card: { readonly id: string }) => card.id === "proposal:proposal_equal_expiry")).toBe(false);
    expect(state.findByUserId).toHaveBeenCalledWith(USER_ID);
    expect({
      entries: readdirSync(state.root).sort(),
      files: Object.fromEntries(Object.entries(state.files).map(([key, file]) => [key, fingerprint(file)]))
    }).toEqual(before);
  });

  it("keeps partial source corruption visible while retaining healthy cards", async () => {
    const state = await fixture();
    writeFileSync(state.files.proposals, "{malformed private");
    const status = await collectPersonalStatus(state.routeOptions);

    expect(status.cards.some((card) => card.id === "approval:approval_owner")).toBe(true);
    expect(status.cards).toContainEqual(expect.objectContaining({ id: "source:proposed-actions", status: "unavailable" }));
    expect(status.sources).toContainEqual(expect.objectContaining({ errorCode: "invalid-json", id: "proposed-actions", result: "corrupt" }));
  });

  it("uses persisted order as the tie-break for same-timestamp learning retractions", async () => {
    const base = {
      key: "focus_time", kind: "preference", learnedAt: "2026-07-21T08:00:00.000Z", source: "user", userId: USER_ID
    } as const;
    const valueLast = await fixture({ provenance: [{ ...base, retraction: true, value: "" }, { ...base, value: "morning" }] });
    const retractionLast = await fixture({ provenance: [{ ...base, value: "morning" }, { ...base, retraction: true, value: "" }] });

    await expect(collectPersonalStatus(valueLast.routeOptions)).resolves.toMatchObject({
      cards: expect.arrayContaining([expect.objectContaining({ id: "learning:preference:focus_time" })])
    });
    const retracted = await collectPersonalStatus(retractionLast.routeOptions);
    expect(retracted.cards.some((card) => card.id === "learning:preference:focus_time")).toBe(false);
  });

  it("rejects identity-bearing query input", async () => {
    const state = await fixture();
    const server = Fastify();
    registerPersonalStatusRoutes(server, state.routeOptions);
    const response = await server.inject({ method: "GET", url: "/api/personal-status?userId=other" });
    expect(response.statusCode).toBe(400);
    expect(state.findByUserId).not.toHaveBeenCalled();
  });
});
