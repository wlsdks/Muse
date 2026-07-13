import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_PLAYBOOK_TEXT_CHARS, queryPlaybook } from "../src/personal-playbook-store.js";

const withStore = async (entries: readonly Record<string, unknown>[]) => {
  const dir = await mkdtemp(join(tmpdir(), "muse-pb-cap-"));
  const file = join(dir, "playbook.json");
  await writeFile(file, JSON.stringify({ entries }), "utf8");
  return queryPlaybook(file, "stark");
};

const entry = (text: string) => ({
  createdAt: "2026-07-13T00:00:00.000Z",
  id: "pb1",
  text,
  userId: "stark"
});

describe("playbook store — a strategy's length is a store invariant, not a hope", () => {
  // A strategy renders VERBATIM into the system prompt of every future turn. The
  // distiller's 80-token output budget bounded the one path that happens to write
  // through it — it was never a property of the store, so `muse playbook add`, a
  // restored file, a synced file or any future writer could bank a 100KB "rule"
  // that then crowds the model's actual instructions out of its own context.
  it("drops a strategy longer than the cap instead of injecting it", async () => {
    const kept = await withStore([entry("x".repeat(MAX_PLAYBOOK_TEXT_CHARS + 1))]);
    expect(kept).toEqual([]);
  });

  it("keeps a strategy at exactly the cap — the bound is inclusive", async () => {
    const kept = await withStore([entry("x".repeat(MAX_PLAYBOOK_TEXT_CHARS))]);
    expect(kept).toHaveLength(1);
  });

  it("keeps an ordinary strategy — the cap must not break real learning", async () => {
    const kept = await withStore([entry("Lead with the answer; no preamble.")]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.text).toBe("Lead with the answer; no preamble.");
  });

  it("drops only the oversized entry, never its neighbours", async () => {
    const kept = await withStore([
      { ...entry("Be concise."), id: "ok1" },
      { ...entry("y".repeat(50_000)), id: "huge" },
      { ...entry("Always cite the file path."), id: "ok2" }
    ]);
    expect(kept.map((e) => e.id).sort()).toEqual(["ok1", "ok2"]);
  });
});
