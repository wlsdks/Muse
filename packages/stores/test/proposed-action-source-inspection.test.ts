import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { inspectProposedActionsSource, proposeMessageAction } from "../src/personal-proposed-action-store.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true }))));

describe("inspectProposedActionsSource", () => {
  it("observes exact proposals without quarantine or metadata changes", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-proposal-inspect-"));
    dirs.push(dir);
    const file = join(dir, "proposals.json");
    const proposal = await proposeMessageAction(file, {
      destination: "C1",
      now: () => new Date("2026-07-22T10:00:00.000Z"),
      providerId: "slack",
      reason: "follow up",
      summary: "Send update",
      text: "hello",
      userId: "owner"
    });
    const before = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    await expect(inspectProposedActionsSource(file)).resolves.toEqual({ result: "available", value: { excludedCount: 0, proposals: [proposal] } });
    const after = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    expect(after.bytes).toEqual(before.bytes);
    expect(after.entries).toEqual(before.entries);
    expect({ mode: after.stat.mode, mtimeMs: after.stat.mtimeMs, size: after.stat.size }).toEqual({ mode: before.stat.mode, mtimeMs: before.stat.mtimeMs, size: before.stat.size });
  });

  it("reports corrupt JSON without creating a quarantine sibling", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-proposal-corrupt-"));
    dirs.push(dir);
    const file = join(dir, "proposals.json");
    await fs.writeFile(file, "{broken", "utf8");
    await expect(inspectProposedActionsSource(file)).resolves.toEqual({ errorCode: "invalid-json", result: "corrupt" });
    expect(await fs.readdir(dir)).toEqual(["proposals.json"]);
  });
});
