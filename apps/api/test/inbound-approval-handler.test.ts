import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listPendingApprovals, recordPendingApproval, type PendingApproval } from "@muse/messaging";
import { describe, expect, it, vi } from "vitest";

import { handleInboundApprovalReply } from "../src/inbound-approval-handler.js";

function pendingFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-inbound-appr-")), "pending-approvals.json");
}

function entry(overrides: Partial<PendingApproval> = {}): PendingApproval {
  return {
    arguments: { summary: "Book a table", url: "http://x.test/book" },
    createdAt: new Date().toISOString(),
    draft: "POST http://x.test/book",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    id: "p1",
    providerId: "telegram",
    risk: "execute",
    source: "42",
    tool: "web_action",
    ...overrides
  };
}

describe("handleInboundApprovalReply", () => {
  it("acks a bare approval reply with the approve/clear commands when a pending entry exists for the channel", async () => {
    const f = pendingFile();
    await recordPendingApproval(f, entry({ id: "go" }));
    const ack = await handleInboundApprovalReply({ pendingFile: f, providerId: "telegram", source: "42", text: "yes" });
    expect(ack).toContain("web_action");
    expect(ack).toContain("muse approvals approve go");
    expect(ack).toContain("muse approvals clear go");
  });

  it("returns undefined (let the agent handle it) for a non-approval message", async () => {
    const f = pendingFile();
    await recordPendingApproval(f, entry());
    expect(await handleInboundApprovalReply({ pendingFile: f, providerId: "telegram", source: "42", text: "what does it say?" })).toBeUndefined();
  });

  it("returns undefined when an approval reply has no pending action for this channel", async () => {
    const f = pendingFile();
    expect(await handleInboundApprovalReply({ pendingFile: f, providerId: "telegram", source: "42", text: "yes" })).toBeUndefined();
  });

  it("scopes to the channel: a pending entry for a different source is ignored", async () => {
    const f = pendingFile();
    await recordPendingApproval(f, entry({ id: "other", source: "99" }));
    expect(await handleInboundApprovalReply({ pendingFile: f, providerId: "telegram", source: "42", text: "approve" })).toBeUndefined();
  });

  it("ignores an expired pending entry", async () => {
    const f = pendingFile();
    await recordPendingApproval(f, entry({ expiresAt: "2020-01-01T00:00:00.000Z", id: "stale" }));
    expect(await handleInboundApprovalReply({ pendingFile: f, providerId: "telegram", source: "42", text: "yes" })).toBeUndefined();
  });

  it("OPT-IN autoRun: a single pending + approval reply re-runs it in-chat and clears it (replay-guard)", async () => {
    const f = pendingFile();
    await recordPendingApproval(f, entry({ id: "go" }));
    const autoRun = vi.fn(async () => ({ ran: true }));
    const reply = await handleInboundApprovalReply({ autoRun, pendingFile: f, providerId: "telegram", source: "42", text: "yes" });
    expect(autoRun).toHaveBeenCalledTimes(1);
    expect(reply).toContain("Done — ran web_action");
    expect(await listPendingApprovals(f)).toHaveLength(0); // cleared
  });

  it("OPT-IN autoRun: a failed re-run leaves it pending and points at the CLI", async () => {
    const f = pendingFile();
    await recordPendingApproval(f, entry({ id: "go" }));
    const autoRun = vi.fn(async () => ({ detail: "Gmail 401", ran: false }));
    const reply = await handleInboundApprovalReply({ autoRun, pendingFile: f, providerId: "telegram", source: "42", text: "yes" });
    expect(reply).toContain("Couldn't run web_action: Gmail 401");
    expect(reply).toContain("muse approvals approve go");
    expect((await listPendingApprovals(f)).map((e) => e.id)).toEqual(["go"]); // still pending
  });

  it("OPT-IN autoRun: MULTIPLE pending is ambiguous → does NOT auto-run, lists ids instead", async () => {
    const f = pendingFile();
    await recordPendingApproval(f, entry({ id: "a", createdAt: "2026-05-22T10:00:00.000Z" }));
    await recordPendingApproval(f, entry({ id: "b", createdAt: "2026-05-22T10:05:00.000Z" }));
    const autoRun = vi.fn(async () => ({ ran: true }));
    const reply = await handleInboundApprovalReply({ autoRun, pendingFile: f, providerId: "telegram", source: "42", text: "yes" });
    expect(autoRun).not.toHaveBeenCalled();
    expect(reply).toContain("2 pending approvals");
    expect(reply).toContain("muse approvals approve a");
    expect(reply).toContain("muse approvals approve b");
  });
});
