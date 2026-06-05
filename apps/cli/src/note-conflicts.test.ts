import { describe, expect, it } from "vitest";

import { classifyNoteContradiction, formatNoteConflicts, salientTokens, selectConflictCandidatePairs } from "./note-conflicts.js";

describe("salientTokens", () => {
  it("keeps content words ≥4 chars and drops stopwords / short tokens", () => {
    const tokens = salientTokens("The office WiFi password is sunflower42 and a cat");
    expect(tokens.has("office")).toBe(true);
    expect(tokens.has("password")).toBe(true);
    expect(tokens.has("sunflower42")).toBe(true);
    expect(tokens.has("wifi")).toBe(true);
    expect(tokens.has("the")).toBe(false); // short
    expect(tokens.has("cat")).toBe(false); // <4 chars
    expect(tokens.has("about")).toBe(false); // stopword (not present anyway)
  });
});

describe("selectConflictCandidatePairs", () => {
  const notes = [
    { path: "work/wifi.md", body: "The office WiFi password is sunflower42." },
    { path: "home/wifi.md", body: "The office WiFi password is daisy99." },
    { path: "hobby/hiking.md", body: "I enjoy weekend hiking trips in the mountains." }
  ];

  it("pairs only notes sharing ≥ minShared salient tokens (same topic), never a note with itself", () => {
    const pairs = selectConflictCandidatePairs(notes, { minShared: 2 });
    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.a.path, pairs[0]!.b.path].sort()).toEqual(["home/wifi.md", "work/wifi.md"]);
    // the unrelated hiking note shares no topic tokens with the wifi notes → not paired
    expect(pairs.some((p) => p.a.path.includes("hiking") || p.b.path.includes("hiking"))).toBe(false);
  });

  it("ranks by shared-token count and caps at maxPairs", () => {
    const many = [
      { path: "a.md", body: "alpha beta gamma delta epsilon" },
      { path: "b.md", body: "alpha beta gamma delta" }, // shares 4 with a
      { path: "c.md", body: "alpha beta" }, // shares 2 with a, 2 with b
      { path: "d.md", body: "alpha beta gamma" } // shares 3 with a
    ];
    const pairs = selectConflictCandidatePairs(many, { maxPairs: 2, minShared: 2 });
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.shared).toBeGreaterThanOrEqual(pairs[1]!.shared); // sorted desc
    expect(pairs[0]!.shared).toBe(4); // a↔b is the strongest overlap
  });

  it("returns nothing when no pair clears the threshold", () => {
    expect(selectConflictCandidatePairs(notes, { minShared: 5 })).toEqual([]);
    expect(selectConflictCandidatePairs([{ path: "lone.md", body: "only one note here" }])).toEqual([]);
  });
});

describe("classifyNoteContradiction", () => {
  const stub = (output: string) => ({ generate: async () => ({ output }) }) as never;

  it("parses the one-word verdict (case-insensitive) from the model", async () => {
    expect(await classifyNoteContradiction("a", "b", { model: "m", modelProvider: stub("CONTRADICT") })).toBe("contradict");
    expect(await classifyNoteContradiction("a", "b", { model: "m", modelProvider: stub("agree") })).toBe("agree");
    expect(await classifyNoteContradiction("a", "b", { model: "m", modelProvider: stub("Unrelated.") })).toBe("unrelated");
  });

  it("returns 'uncertain' on an unparseable reply or a thrown provider", async () => {
    expect(await classifyNoteContradiction("a", "b", { model: "m", modelProvider: stub("maybe?") })).toBe("uncertain");
    const thrower = { generate: async () => { throw new Error("down"); } } as never;
    expect(await classifyNoteContradiction("a", "b", { model: "m", modelProvider: thrower })).toBe("uncertain");
  });
});

describe("formatNoteConflicts", () => {
  it("lists each conflicting pair with a review nudge", () => {
    const out = formatNoteConflicts([{ a: "work/wifi.md", b: "home/wifi.md" }]);
    expect(out).toContain("1 place(s) your notes disagree");
    expect(out).toContain("work/wifi.md ↔ home/wifi.md");
    expect(out).toContain("ground an answer on the wrong one");
  });

  it("says all-clear when there are no conflicts (no invented warning)", () => {
    expect(formatNoteConflicts([])).toBe("✓ No contradictions found among your notes.\n");
  });
});
