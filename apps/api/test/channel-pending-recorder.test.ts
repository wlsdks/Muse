import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listPendingApprovals } from "@muse/messaging";
import { describe, expect, it, vi } from "vitest";

import { createChannelPendingRecorder } from "../src/channel-pending-recorder.js";

function pendingFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-pending-rec-")), "pending-approvals.json");
}

describe("createChannelPendingRecorder", () => {
  it("persists a refusal as a pending approval with re-run args + a TTL expiry", async () => {
    const file = pendingFile();
    const record = createChannelPendingRecorder({
      now: () => new Date("2026-05-22T10:00:00.000Z"),
      pendingFile: file,
      providerId: "telegram",
      source: "42",
      ttlMs: 60 * 60 * 1000
    });
    await record({
      arguments: { body: "hi", subject: "Q3", to: "bob" },
      draft: 'to bob, subject "Q3"',
      risk: "execute",
      tool: "email_send",
      userId: "telegram:42"
    });

    const list = await listPendingApprovals(file, () => new Date("2026-05-22T10:30:00.000Z"));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      arguments: { body: "hi", subject: "Q3", to: "bob" },
      providerId: "telegram",
      source: "42",
      tool: "email_send",
      userId: "telegram:42"
    });
    expect(list[0]!.expiresAt).toBe("2026-05-22T11:00:00.000Z");
  });

  it("the entry expires after its TTL (not in the live worklist past expiry)", async () => {
    const file = pendingFile();
    const record = createChannelPendingRecorder({
      now: () => new Date("2026-05-22T10:00:00.000Z"),
      pendingFile: file,
      providerId: "telegram",
      source: "42",
      ttlMs: 60 * 60 * 1000
    });
    await record({ arguments: {}, draft: "x", risk: "execute", tool: "web_action" });
    const past = await listPendingApprovals(file, () => new Date("2026-05-22T12:00:00.000Z"));
    expect(past).toEqual([]);
  });

  it("delegates to the injected store writer", async () => {
    const write = vi.fn(async () => {});
    const record = createChannelPendingRecorder({ pendingFile: "/tmp/x.json", providerId: "discord", recordPendingApproval: write, source: "c1" });
    await record({ arguments: { url: "http://x.test" }, draft: "POST http://x.test", risk: "execute", tool: "web_action" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![1]).toMatchObject({ providerId: "discord", source: "c1", tool: "web_action" });
  });
});
