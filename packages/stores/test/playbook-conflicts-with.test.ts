import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_CONFLICTS_PER_ENTRY, queryPlaybook } from "../src/personal-playbook-store.js";

const withStore = async (entries: readonly Record<string, unknown>[]) => {
  const dir = await mkdtemp(join(tmpdir(), "muse-pb-conflicts-"));
  const file = join(dir, "playbook.json");
  await writeFile(file, JSON.stringify({ entries }), "utf8");
  return queryPlaybook(file, "stark");
};

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  createdAt: "2026-07-13T00:00:00.000Z",
  id,
  text: "Lead with the answer; no preamble.",
  userId: "stark",
  ...extra
});

describe("playbook store — conflictsWith is a validated, bounded field", () => {
  it("reads back a normal conflictsWith list unchanged", async () => {
    const kept = await withStore([entry("pb1", { conflictsWith: ["pb2", "pb3"] })]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.conflictsWith).toEqual(["pb2", "pb3"]);
  });

  it("an absent conflictsWith reads as undefined, never an empty array (legacy entries)", async () => {
    const kept = await withStore([entry("pb1")]);
    expect(kept[0]?.conflictsWith).toBeUndefined();
  });

  it("keeps an entry at exactly the cap", async () => {
    const ids = Array.from({ length: MAX_CONFLICTS_PER_ENTRY }, (_, i) => `other-${String(i)}`);
    const kept = await withStore([entry("pb1", { conflictsWith: ids })]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.conflictsWith).toHaveLength(MAX_CONFLICTS_PER_ENTRY);
  });

  it("drops the WHOLE entry when conflictsWith exceeds the cap — fail-closed on read", async () => {
    const ids = Array.from({ length: MAX_CONFLICTS_PER_ENTRY + 1 }, (_, i) => `other-${String(i)}`);
    const kept = await withStore([entry("pb1", { conflictsWith: ids })]);
    expect(kept).toEqual([]);
  });

  it("drops the whole entry when conflictsWith is not an array of strings", async () => {
    const kept = await withStore([entry("pb1", { conflictsWith: [123, "ok"] })]);
    expect(kept).toEqual([]);
  });

  it("drops the whole entry when conflictsWith is not an array at all", async () => {
    const kept = await withStore([entry("pb1", { conflictsWith: "pb2" })]);
    expect(kept).toEqual([]);
  });

  it("an oversized single conflicting id drops the entry, not just the id", async () => {
    const kept = await withStore([entry("pb1", { conflictsWith: ["x".repeat(201)] })]);
    expect(kept).toEqual([]);
  });

  it("drops an entry whose conflictsWith names ITSELF — a self-edge would make the rule suppress itself", async () => {
    // A self-referential edge can't arise from the learn path (the id is fresh,
    // absent from the bank it's compared against), so it is corruption or a
    // hand-edit — and at inject time it would make the rule its own conflict loser,
    // silently dropping a legitimate learned strategy. Fail closed on read.
    const kept = await withStore([entry("pb1", { conflictsWith: ["pb_other", "pb1"] })]);
    expect(kept).toEqual([]);
  });

  it("drops only the corrupt entry, never its neighbours", async () => {
    const kept = await withStore([
      entry("ok1", { conflictsWith: ["ok2"] }),
      entry("bad", { conflictsWith: "not-an-array" }),
      entry("ok2")
    ]);
    expect(kept.map((e) => e.id).sort()).toEqual(["ok1", "ok2"]);
  });
});
