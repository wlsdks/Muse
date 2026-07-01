import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendPlaybookInjection,
  forwardRecordingInjections,
  playbookInjectionsPath,
  readSessionInjectedIds
} from "./playbook-injections.js";

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "muse-injections-"));
  return join(dir, "playbook-injections.jsonl");
}

describe("playbook-injections — per-session injected-id record", () => {
  it("round-trips: appended ids are read back for the session window", async () => {
    const file = await tmpFile();
    await appendPlaybookInjection({ ids: ["pb_a", "pb_b"], tsIso: "2026-07-02T10:00:00.000Z", userId: "stark" }, file);
    await appendPlaybookInjection({ ids: ["pb_b", "pb_c"], tsIso: "2026-07-02T10:05:00.000Z", userId: "stark" }, file);
    const ids = await readSessionInjectedIds({ sinceIso: "2026-07-02T09:00:00.000Z", userId: "stark" }, file);
    expect([...ids].sort()).toEqual(["pb_a", "pb_b", "pb_c"]);
  });

  it("session scoping: records BEFORE sinceIso and records for OTHER users are excluded", async () => {
    const file = await tmpFile();
    await appendPlaybookInjection({ ids: ["pb_old"], tsIso: "2026-07-01T10:00:00.000Z", userId: "stark" }, file);
    await appendPlaybookInjection({ ids: ["pb_other"], tsIso: "2026-07-02T10:00:00.000Z", userId: "guest" }, file);
    await appendPlaybookInjection({ ids: ["pb_now"], tsIso: "2026-07-02T10:00:00.000Z", userId: "stark" }, file);
    const ids = await readSessionInjectedIds({ sinceIso: "2026-07-02T00:00:00.000Z", userId: "stark" }, file);
    expect([...ids]).toEqual(["pb_now"]);
  });

  it("missing file reads as an empty set (legacy session — caller keeps cosine credit)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-injections-"));
    const ids = await readSessionInjectedIds({ sinceIso: "2026-07-02T00:00:00.000Z", userId: "stark" }, join(dir, "absent.jsonl"));
    expect(ids.size).toBe(0);
  });

  it("skips empty-id appends and drops malformed / non-string lines on read", async () => {
    const file = await tmpFile();
    await appendPlaybookInjection({ ids: [], tsIso: "2026-07-02T10:00:00.000Z", userId: "stark" }, file);
    await writeFile(file, `not-json\n${JSON.stringify({ ids: [7, "pb_ok"], tsIso: "2026-07-02T10:00:00.000Z", userId: "stark" })}\n`, { flag: "a" });
    const ids = await readSessionInjectedIds({ sinceIso: "2026-07-02T00:00:00.000Z", userId: "stark" }, file);
    expect([...ids]).toEqual(["pb_ok"]);
  });

  it("trims the file to the newest lines once it grows past the byte threshold", async () => {
    const file = await tmpFile();
    const filler = "x".repeat(600);
    for (let index = 0; index < 500; index += 1) {
      await writeFile(file, `${JSON.stringify({ ids: [`pb_${index.toString()}_${filler}`], tsIso: "2026-07-02T10:00:00.000Z", userId: "stark" })}\n`, { flag: "a" });
    }
    await appendPlaybookInjection({ ids: ["pb_newest"], tsIso: "2026-07-02T11:00:00.000Z", userId: "stark" }, file);
    const raw = await readFile(file, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(500);
    expect(raw).toContain("pb_newest");
  });

  it("playbookInjectionsPath honors the MUSE_PLAYBOOK_INJECTIONS_FILE override", () => {
    expect(playbookInjectionsPath({ MUSE_PLAYBOOK_INJECTIONS_FILE: "/tmp/x.jsonl" } as NodeJS.ProcessEnv)).toBe("/tmp/x.jsonl");
    expect(playbookInjectionsPath({ HOME: "/home/u" } as NodeJS.ProcessEnv)).toContain("playbook-injections.jsonl");
  });
});

describe("forwardRecordingInjections — stream passthrough recorder", () => {
  async function* events(): AsyncIterable<{ type: string; playbookInjectedIds?: readonly unknown[] }> {
    yield { type: "text-delta" };
    yield { playbookInjectedIds: ["pb_a", 9, "pb_b"], type: "done" };
  }

  it("yields every event unchanged and records the string ids from the done event", async () => {
    const recorded: (readonly string[])[] = [];
    const seen: string[] = [];
    for await (const event of forwardRecordingInjections(events(), (ids) => recorded.push(ids))) {
      seen.push(event.type);
    }
    expect(seen).toEqual(["text-delta", "done"]);
    expect(recorded).toEqual([["pb_a", "pb_b"]]);
  });

  it("does not record when the done event carries no ids", async () => {
    async function* bare(): AsyncIterable<{ type: string }> {
      yield { type: "done" };
    }
    const recorded: (readonly string[])[] = [];
    for await (const _event of forwardRecordingInjections(bare(), (ids) => recorded.push(ids))) {
      // consume
    }
    expect(recorded).toEqual([]);
  });
});
