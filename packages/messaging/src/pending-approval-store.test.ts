import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  clearPendingApproval,
  filterUnexpired,
  listPendingApprovals,
  readPendingApprovals,
  recordPendingApproval,
  type PendingApproval
} from "./pending-approval-store.js";

function storeFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-pending-")), "pending-approvals.json");
}

function entry(overrides: Partial<PendingApproval> = {}): PendingApproval {
  return {
    arguments: { subject: "Q3", to: "bob" },
    createdAt: "2026-05-22T10:00:00.000Z",
    draft: 'to bob, subject "Q3"',
    expiresAt: "2026-05-23T10:00:00.000Z",
    id: "p1",
    providerId: "telegram",
    risk: "execute",
    source: "42",
    tool: "email_send",
    ...overrides
  };
}

describe("pending-approval-store", () => {
  it("records and lists an un-expired pending approval with its re-run args", async () => {
    const file = storeFile();
    await recordPendingApproval(file, entry());
    const now = () => new Date("2026-05-22T11:00:00.000Z");
    const list = await listPendingApprovals(file, now);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ tool: "email_send", arguments: { to: "bob", subject: "Q3" } });
  });

  it("filters out expired entries from the live worklist", async () => {
    const file = storeFile();
    await recordPendingApproval(file, entry({ id: "fresh", expiresAt: "2026-05-23T10:00:00.000Z" }));
    await recordPendingApproval(file, entry({ id: "stale", expiresAt: "2026-05-22T09:00:00.000Z" }));
    const now = () => new Date("2026-05-22T11:00:00.000Z");
    const list = await listPendingApprovals(file, now);
    expect(list.map((e) => e.id)).toEqual(["fresh"]);
  });

  it("scopes to a channel and sorts newest-first", async () => {
    const file = storeFile();
    await recordPendingApproval(file, entry({ id: "a", createdAt: "2026-05-22T10:00:00.000Z", source: "42" }));
    await recordPendingApproval(file, entry({ id: "b", createdAt: "2026-05-22T10:05:00.000Z", source: "42" }));
    await recordPendingApproval(file, entry({ id: "c", source: "99" }));
    const now = () => new Date("2026-05-22T11:00:00.000Z");
    const scoped = await listPendingApprovals(file, now, { providerId: "telegram", source: "42" });
    expect(scoped.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("clears by id (and prunes expired) and reports whether anything matched", async () => {
    const file = storeFile();
    await recordPendingApproval(file, entry({ id: "keep", expiresAt: "2026-05-23T10:00:00.000Z" }));
    await recordPendingApproval(file, entry({ id: "drop", expiresAt: "2026-05-23T10:00:00.000Z" }));
    await recordPendingApproval(file, entry({ id: "expired", expiresAt: "2026-05-22T09:00:00.000Z" }));
    const now = () => new Date("2026-05-22T11:00:00.000Z");
    expect(await clearPendingApproval(file, "drop", now)).toBe(true);
    expect(await clearPendingApproval(file, "nonexistent", now)).toBe(false);
    // Both "drop" and the expired entry are gone; only "keep" remains on disk.
    expect((await readPendingApprovals(file)).map((e) => e.id)).toEqual(["keep"]);
  });

  it("tolerant read: missing file → [], corrupt JSON → [] (quarantined), bad entries skipped", async () => {
    expect(await readPendingApprovals(storeFile())).toEqual([]);
    const corrupt = storeFile();
    writeFileSync(corrupt, "{not json");
    expect(await readPendingApprovals(corrupt)).toEqual([]);
    const partial = storeFile();
    writeFileSync(partial, JSON.stringify({ pending: [{ id: "x" }, entry()] }));
    expect((await readPendingApprovals(partial)).map((e) => e.id)).toEqual(["p1"]);
  });

  it("filterUnexpired is a pure helper over an in-memory list", () => {
    const now = new Date("2026-05-22T11:00:00.000Z");
    const result = filterUnexpired([entry({ id: "ok" }), entry({ id: "old", expiresAt: "2026-05-22T09:00:00.000Z" })], now);
    expect(result.map((e) => e.id)).toEqual(["ok"]);
  });
});
