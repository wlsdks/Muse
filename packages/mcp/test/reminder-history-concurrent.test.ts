import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appendReminderHistory, readReminderHistory, type ReminderHistoryEntry } from "../src/personal-reminder-history-store.js";

let files: string[] = [];
const freshFile = () => {
  const file = join(tmpdir(), `muse-reminder-history-${randomUUID()}.json`);
  files.push(file);
  return file;
};
afterEach(async () => { await Promise.all(files.map((f) => rm(f, { force: true }))); files = []; });

const entry = (reminderId: string): ReminderHistoryEntry => ({
  destination: "555",
  firedAtIso: "2026-06-01T00:00:00Z",
  providerId: "telegram",
  reminderId,
  status: "delivered",
  text: `delivered ${reminderId}`
});

// appendReminderHistory is a read-modify-write. Before the per-file mutation queue,
// concurrent reminder fires lost records (last write clobbered the rest — a lost
// fire record can let a one-shot reminder re-fire) and crashed with ENOENT on the
// same-ms tmp-${pid}-${Date.now()} path.
describe("appendReminderHistory under concurrency", () => {
  it("preserves every concurrently-recorded fire (no lost record, no rename crash)", async () => {
    const file = freshFile();
    await Promise.all(Array.from({ length: 25 }, (_unused, i) => appendReminderHistory(file, entry(`r${i.toString()}`), { capacity: 100 })));
    const all = await readReminderHistory(file);
    expect(all).toHaveLength(25);
    expect(new Set(all.map((e) => e.reminderId)).size).toBe(25);
  }, 30_000);

  it("still honours the capacity cap (newest kept) under concurrent over-cap fires", async () => {
    const file = freshFile();
    await Promise.all(Array.from({ length: 30 }, (_unused, i) => appendReminderHistory(file, entry(`q${i.toString()}`), { capacity: 10 })));
    expect(await readReminderHistory(file)).toHaveLength(10);
  }, 30_000);
});
