import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendActionLog,
  encryptActionLogAtRest,
  isActionLogEncrypted,
  pruneActionLogByAge,
  readActionLog,
  verifyActionLogChainFile,
  type ActionLogEntry
} from "../src/personal-action-log-store.js";

const DAY_MS = 86_400_000;

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), "action-log-prune-")); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

const entry = (i: number, whenIso: string): ActionLogEntry => ({
  id: `a${i.toString()}`,
  result: "performed",
  userId: "u",
  what: `did thing ${i.toString()}`,
  when: whenIso,
  why: "because"
});

describe("pruneActionLogByAge — whole-file archival rotation (DS-13)", () => {
  it("rotates the whole file to an archive when the oldest entry exceeds the window, leaving a fresh empty live log", async () => {
    const file = join(dir, "actions.json");
    const now = Date.parse("2026-07-02T00:00:00Z");
    await appendActionLog(file, entry(0, new Date(now - 400 * DAY_MS).toISOString()));
    await appendActionLog(file, entry(1, new Date(now - 1 * DAY_MS).toISOString()));

    const result = await pruneActionLogByAge(file, { ageDays: 365, now });
    expect(result.rotated).toBe(true);
    expect(result.entriesArchived).toBe(2);
    expect(result.archivePath).toBeDefined();

    const live = await readActionLog(file);
    expect(live).toEqual([]);

    const archived = await readActionLog(result.archivePath!);
    expect(archived).toHaveLength(2);
    expect(archived[0]!.id).toBe("a0");
    expect(archived[1]!.id).toBe("a1");

    // Nothing was lost or rewritten — the archive is still a complete, independently
    // verifiable chain (never partial deletion mid-chain).
    const chainCheck = await verifyActionLogChainFile(result.archivePath!);
    expect(chainCheck.ok).toBe(true);
    expect(chainCheck.linkedEntries).toBe(2);
  });

  it("is a no-op when the oldest entry is still inside the window", async () => {
    const file = join(dir, "actions.json");
    const now = Date.parse("2026-07-02T00:00:00Z");
    await appendActionLog(file, entry(0, new Date(now - 10 * DAY_MS).toISOString()));
    await appendActionLog(file, entry(1, new Date(now - 1 * DAY_MS).toISOString()));

    const result = await pruneActionLogByAge(file, { ageDays: 365, now });
    expect(result.rotated).toBe(false);

    const live = await readActionLog(file);
    expect(live).toHaveLength(2); // nothing moved
  });

  it("is a no-op on a missing / empty log", async () => {
    const file = join(dir, "absent.json");
    const result = await pruneActionLogByAge(file, { ageDays: 1, now: Date.now() });
    expect(result.rotated).toBe(false);
  });

  it("a fresh append after rotation starts a NEW verifiable chain (genesis-anchored, not a tamper signal)", async () => {
    const file = join(dir, "actions.json");
    const now = Date.parse("2026-07-02T00:00:00Z");
    await appendActionLog(file, entry(0, new Date(now - 400 * DAY_MS).toISOString()));
    await pruneActionLogByAge(file, { ageDays: 365, now });

    await appendActionLog(file, entry(1, new Date(now).toISOString()));
    const live = await readActionLog(file);
    expect(live).toHaveLength(1);
    const chainCheck = await verifyActionLogChainFile(file);
    expect(chainCheck.ok).toBe(true);
    expect(chainCheck.linkedEntries).toBe(1);
  });

  it("preserves encryption-at-rest across rotation: the fresh live file stays encrypted", async () => {
    const file = join(dir, "actions.json");
    const now = Date.parse("2026-07-02T00:00:00Z");
    await appendActionLog(file, entry(0, new Date(now - 400 * DAY_MS).toISOString()));
    await encryptActionLogAtRest(file);
    expect(await isActionLogEncrypted(file)).toBe(true);

    const result = await pruneActionLogByAge(file, { ageDays: 365, now });
    expect(result.rotated).toBe(true);
    expect(await isActionLogEncrypted(file)).toBe(true);
    // The live (encrypted, empty) file still reads back as zero entries.
    expect(await readActionLog(file)).toEqual([]);
  });

  it("idempotent: running twice back-to-back with nothing new to prune is a safe no-op the second time", async () => {
    const file = join(dir, "actions.json");
    const now = Date.parse("2026-07-02T00:00:00Z");
    await appendActionLog(file, entry(0, new Date(now - 400 * DAY_MS).toISOString()));

    const first = await pruneActionLogByAge(file, { ageDays: 365, now });
    expect(first.rotated).toBe(true);

    const second = await pruneActionLogByAge(file, { ageDays: 365, now });
    expect(second.rotated).toBe(false); // fresh live file is empty — nothing to rotate
  });
});
