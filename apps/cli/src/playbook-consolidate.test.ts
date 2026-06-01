import { describe, expect, it } from "vitest";

import { consolidatePlaybook, type ConsolidatePlaybookDeps, type PlaybookConsolidateItem } from "./playbook-consolidate.js";

function recorder(over: Partial<ConsolidatePlaybookDeps> = {}) {
  const recorded: { text: string; tag: string | undefined }[] = [];
  const removed: string[] = [];
  const logs: string[] = [];
  const deps: ConsolidatePlaybookDeps = {
    apply: true,
    log: (l) => logs.push(l),
    merge: async (texts) => `merged: ${texts.join(" / ")}`,
    record: async (text, tag) => { recorded.push({ tag, text }); },
    remove: async (id) => { removed.push(id); },
    validate: async () => ({ accept: true, reason: "covers all" }),
    ...over
  };
  return { deps, logs, recorded, removed };
}

const cluster: readonly PlaybookConsolidateItem[] = [
  { id: "a", tag: "email", text: "summaries as bullets" },
  { id: "b", tag: "email", text: "summarise with bullet points" }
];

describe("consolidatePlaybook — SkillOpt held-out gate", () => {
  it("commits when the gate accepts: merged recorded, originals removed", async () => {
    const { deps, recorded, removed } = recorder();
    const res = await consolidatePlaybook([cluster], deps);
    expect(res).toEqual({ merged: 1, rejected: 0 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.tag).toBe("email");
    expect(removed.sort()).toEqual(["a", "b"]);
  });

  it("ROLLS BACK when the gate rejects: nothing recorded, nothing removed", async () => {
    const { deps, logs, recorded, removed } = recorder({
      validate: async () => ({ accept: false, reason: '"merged" drops [b]' })
    });
    const res = await consolidatePlaybook([cluster], deps);
    expect(res).toEqual({ merged: 0, rejected: 1 });
    expect(recorded).toEqual([]);
    expect(removed).toEqual([]);
    expect(logs.some((l) => l.includes("rejected (held-out gate)"))).toBe(true);
  });

  it("leaves a genuinely-distinct cluster alone when the merger returns undefined", async () => {
    const { deps, recorded } = recorder({ merge: async () => undefined });
    const res = await consolidatePlaybook([cluster], deps);
    expect(res).toEqual({ merged: 0, rejected: 0 });
    expect(recorded).toEqual([]);
  });

  it("preview (apply=false) reports the merge but writes nothing", async () => {
    const { deps, recorded, removed } = recorder({ apply: false });
    const res = await consolidatePlaybook([cluster], deps);
    expect(res).toEqual({ merged: 1, rejected: 0 });
    expect(recorded).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("skips a singleton cluster (nothing to merge)", async () => {
    const { deps, recorded } = recorder();
    const res = await consolidatePlaybook([[cluster[0]!]], deps);
    expect(res).toEqual({ merged: 0, rejected: 0 });
    expect(recorded).toEqual([]);
  });
});
