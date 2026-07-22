import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { inspectPendingApprovalsSource, recordPendingApproval, type PendingApproval } from "../src/index.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true }))));

const APPROVAL: PendingApproval = {
  arguments: { text: "hello" },
  createdAt: "2026-07-22T10:00:00.000Z",
  draft: "hello",
  expiresAt: "2026-07-22T14:00:00.000Z",
  id: "approval-1",
  providerId: "slack",
  risk: "execute",
  source: "C1",
  tool: "send_message",
  userId: "owner"
};

describe("inspectPendingApprovalsSource", () => {
  it("returns strict pending data without changing the store", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-pending-inspect-"));
    dirs.push(dir);
    const file = join(dir, "pending.json");
    await recordPendingApproval(file, APPROVAL);
    const before = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    await expect(inspectPendingApprovalsSource(file)).resolves.toEqual({ result: "available", value: { excludedCount: 0, pending: [APPROVAL] } });
    const after = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    expect(after.bytes).toEqual(before.bytes);
    expect(after.entries).toEqual(before.entries);
    expect({ mode: after.stat.mode, mtimeMs: after.stat.mtimeMs, size: after.stat.size }).toEqual({ mode: before.stat.mode, mtimeMs: before.stat.mtimeMs, size: before.stat.size });
  });

  it("distinguishes corruption and does not quarantine it", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-pending-corrupt-"));
    dirs.push(dir);
    const file = join(dir, "pending.json");
    await fs.writeFile(file, "{broken", "utf8");
    await expect(inspectPendingApprovalsSource(file)).resolves.toEqual({ errorCode: "invalid-json", result: "corrupt" });
    expect(await fs.readdir(dir)).toEqual(["pending.json"]);
    expect(await fs.readFile(file, "utf8")).toBe("{broken");
  });
});
