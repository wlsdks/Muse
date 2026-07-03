import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { enqueueLearnEvent, pruneLearnQueueByAge, readPendingLearnEvents, type LearnCorrectionEvent } from "../src/learn-queue.js";

const DAY_MS = 86_400_000;

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), "learn-queue-prune-")); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

const event = (id: string, enqueuedAtMs: number): LearnCorrectionEvent => ({
  correction: "actually do X",
  enqueuedAtMs,
  id,
  priorAnswer: "did Y",
  userId: "u"
});

describe("pruneLearnQueueByAge — defensive cap on the self-learning queue (DS-13)", () => {
  it("drops pending events older than the window and keeps recent ones", async () => {
    const file = join(dir, "learn-queue.jsonl");
    const now = Date.parse("2026-07-02T00:00:00Z");
    await enqueueLearnEvent(file, event("stale", now - 60 * DAY_MS));
    await enqueueLearnEvent(file, event("fresh", now - 1 * DAY_MS));

    const result = await pruneLearnQueueByAge(file, { ageDays: 30, now });
    expect(result).toEqual({ dropped: 1, kept: 1 });

    const remaining = await readPendingLearnEvents(file);
    expect(remaining.map((e) => e.id)).toEqual(["fresh"]);
  });

  it("is a safe no-op on a missing file", async () => {
    const file = join(dir, "absent.jsonl");
    const result = await pruneLearnQueueByAge(file, { ageDays: 30, now: Date.now() });
    expect(result).toEqual({ dropped: 0, kept: 0 });
  });

  it("idempotent: a second run with nothing new to drop changes nothing", async () => {
    const file = join(dir, "learn-queue.jsonl");
    const now = Date.parse("2026-07-02T00:00:00Z");
    await enqueueLearnEvent(file, event("fresh", now - 1 * DAY_MS));

    const first = await pruneLearnQueueByAge(file, { ageDays: 30, now });
    expect(first).toEqual({ dropped: 0, kept: 1 });
    const second = await pruneLearnQueueByAge(file, { ageDays: 30, now });
    expect(second).toEqual({ dropped: 0, kept: 1 });
    expect((await readPendingLearnEvents(file)).map((e) => e.id)).toEqual(["fresh"]);
  });
});
