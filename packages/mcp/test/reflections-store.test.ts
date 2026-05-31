import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addReflections, listReflections, readReflections, type NewReflection } from "../src/reflections-store.js";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "muse-reflections-"));
  file = join(dir, "reflections.json");
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

const ref = (over: Partial<NewReflection> = {}): NewReflection => ({
  createdAtMs: 100,
  id: "r1",
  insight: "Runs every morning",
  sourceIds: ["ep-1", "ep-2"],
  supportCount: 2,
  ...over
});

describe("reflections-store", () => {
  it("adds fresh reflections (returning the count) and round-trips the grounding fields", async () => {
    const added = await addReflections(file, [ref()]);
    expect(added).toBe(1);
    expect(await readReflections(file)).toEqual([{ createdAtMs: 100, id: "r1", insight: "Runs every morning", sourceIds: ["ep-1", "ep-2"], supportCount: 2 }]);
  });

  it("DEDUPES the same recurring theme across passes (normalised insight — case + whitespace)", async () => {
    await addReflections(file, [ref({ id: "a", insight: "Runs every morning" })]);
    const addedAgain = await addReflections(file, [ref({ id: "b", insight: "  runs   EVERY morning  " })]); // same normalised
    expect(addedAgain).toBe(0);
    expect(await readReflections(file)).toHaveLength(1);
  });

  it("dedupes within a single batch and skips an empty/whitespace insight", async () => {
    const added = await addReflections(file, [
      ref({ id: "a", insight: "Likes tea" }),
      ref({ id: "b", insight: "likes TEA" }), // dup in-batch
      ref({ id: "c", insight: "   " }) // empty after normalise → skipped
    ]);
    expect(added).toBe(1);
    expect((await readReflections(file)).map((r) => r.id)).toEqual(["a"]);
  });

  it("returns 0 for an empty incoming list (no write)", async () => {
    expect(await addReflections(file, [])).toBe(0);
  });

  it("tolerant read: missing / malformed / wrong-shape file → []", async () => {
    expect(await readReflections(join(dir, "nope.json"))).toEqual([]);
    await writeFile(file, "{ not json", "utf8");
    expect(await readReflections(file)).toEqual([]);
    await writeFile(file, JSON.stringify({ reflections: "not-an-array" }), "utf8");
    expect(await readReflections(file)).toEqual([]);
  });

  it("filters a tampered entry (empty insight or non-finite supportCount) on read", async () => {
    await writeFile(file, JSON.stringify({
      reflections: [
        { createdAtMs: 1, id: "good", insight: "ok", sourceIds: ["e1"], supportCount: 2 },
        { createdAtMs: 2, id: "empty", insight: "", sourceIds: [], supportCount: 1 },
        { createdAtMs: 3, id: "nan", insight: "x", sourceIds: [], supportCount: Number.NaN }
      ]
    }), "utf8");
    expect((await readReflections(file)).map((r) => r.id)).toEqual(["good"]);
  });

  it("listReflections returns reflections newest-first", async () => {
    const entries = [ref({ createdAtMs: 100, id: "old" }), ref({ createdAtMs: 300, id: "new" }), ref({ createdAtMs: 200, id: "mid" })];
    expect(listReflections(entries).map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });
});
