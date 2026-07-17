import { describe, expect, it } from "vitest";

import * as policy from "./index.js";
import {
  evaluateProgressiveAutonomy,
  type ProgressiveAutonomyActionEnvelope,
  type StandingGrant
} from "./index.js";

const link = {
  artifactType: "task",
  linkedAt: "2026-07-17T01:00:00.000Z",
  providerId: "local",
  role: "next-step",
  taskId: "task-1"
} as const;

const envelope: ProgressiveAutonomyActionEnvelope = {
  action: "muse.tasks.complete-linked-next-step",
  idempotencyKey: "idem-1",
  link,
  schemaVersion: 1,
  threadId: "thread-1",
  traceId: "trace-1",
  transition: { from: "open", to: "done" },
  userId: "user-1"
};

const grant: StandingGrant = {
  action: "muse.tasks.complete-linked-next-step",
  executorVersion: 1,
  expiresAt: "2026-07-18T00:00:00.000Z",
  id: "grant-1",
  issuedAt: "2026-07-17T00:00:00.000Z",
  issuedBy: "user",
  link,
  maxUses: 1,
  policyVersion: 1,
  schemaVersion: 1,
  threadId: "thread-1",
  transition: { from: "open", to: "done" },
  userId: "user-1"
};

describe("progressive autonomy policy", () => {
  it("allows only an exact active grant in live mode while shadow mode preserves confirmation", () => {
    const live = evaluateProgressiveAutonomy({
      envelope,
      executorVersion: 1,
      grant,
      mode: "live",
      now: new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      remainingUses: 1
    });
    const shadow = evaluateProgressiveAutonomy({
      envelope,
      executorVersion: 1,
      grant,
      mode: "shadow",
      now: new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      remainingUses: 1
    });

    expect(live).toMatchObject({
      enforcementDecision: "allow-standing",
      shadowAssessment: "wouldAllowStanding"
    });
    expect(shadow).toMatchObject({
      enforcementDecision: "confirm",
      shadowAssessment: "wouldAllowStanding"
    });
  });

  it.each([
    ["hard deny", { hardDeny: true }],
    ["veto", { veto: true }],
    ["missing link authority", { authorityStatus: "missing" as const }],
    ["corrupt link authority", { authorityStatus: "corrupt" as const }],
    ["mismatched link authority", { authorityStatus: "mismatch" as const }],
    ["unsupported action", { envelope: { ...envelope, action: "muse.tasks.delete" } }]
  ])("keeps %s above standing permission in both enforcement and shadow", (_label, override) => {
    const decision = evaluateProgressiveAutonomy({
      envelope,
      executorVersion: 1,
      grant,
      mode: "live",
      now: new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      remainingUses: 1,
      ...override
    });

    expect(decision).toMatchObject({
      enforcementDecision: "deny",
      shadowAssessment: "wouldDeny"
    });
  });

  it.each([
    ["missing grant", { grant: undefined }],
    ["expired grant", { now: new Date("2026-07-19T00:00:00.000Z") }],
    ["revoked grant", { grantStatus: "revoked" as const }],
    ["policy version mismatch", { policyVersion: 2 }],
    ["executor version mismatch", { executorVersion: 2 }],
    ["scope mismatch", { grant: { ...grant, threadId: "thread-2" } }],
    ["exhausted uses", { remainingUses: 0 }]
  ])("requires confirmation for %s", (_label, override) => {
    const decision = evaluateProgressiveAutonomy({
      envelope,
      executorVersion: 1,
      grant,
      mode: "live",
      now: new Date("2026-07-17T12:00:00.000Z"),
      policyVersion: 1,
      remainingUses: 1,
      ...override
    });

    expect(decision).toMatchObject({
      enforcementDecision: "confirm",
      shadowAssessment: "wouldConfirm"
    });
  });

  it("does not expose a capability mint or raw grant builder from the public policy barrel", () => {
    expect("createStandingGrantIssuerAuthority" in policy).toBe(false);
    expect("issueStandingGrant" in policy).toBe(false);
  });
});
