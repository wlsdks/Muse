import { describe, expect, it } from "vitest";

import { augmentNoteEvidenceWithCited } from "./commands-ask.js";

describe("augmentNoteEvidenceWithCited — --with-tools verdict evidence (no false-flag, additive only)", () => {
  const base = [{ cosine: 0.8, score: 0.8, source: "work.md", text: "The office VPN needs MTU 1380 on wg0." }];
  const live = [
    { chunks: [{ text: "The office VPN needs MTU 1380 on wg0." }], source: "work.md" },
    { chunks: [{ text: "The garage door code is 4417." }, { text: "Spare key is under the third pot." }], source: "home.md" },
    { chunks: [{ text: "Quarterly review is on the 14th." }], source: "q3.md" }
  ];

  it("adds the FULL text of a cited note the pre-retrieval top-K missed (the false-flag fix)", () => {
    // The agent answered from home.md (via knowledge_search) but the CLI top-K
    // only had work.md — without augmentation the verdict scores home.md's claim
    // as uncovered and false-flags a correct answer.
    const out = augmentNoteEvidenceWithCited(base, ["home.md"], live);
    const sources = out.map((m) => m.source);
    expect(sources).toContain("work.md"); // base preserved
    expect(sources).toContain("home.md"); // cited note pulled in
    expect(out.filter((m) => m.source === "home.md").map((m) => m.text)).toEqual([
      "The garage door code is 4417.",
      "Spare key is under the third pot."
    ]);
  });

  it("does NOT add a note the answer never cited (evidence stays scoped to what was used)", () => {
    const out = augmentNoteEvidenceWithCited(base, ["home.md"], live);
    expect(out.map((m) => m.source)).not.toContain("q3.md");
  });

  it("does NOT duplicate a chunk already present in the base top-K", () => {
    // work.md's chunk is already in base AND in live; cite it — it must appear once.
    const out = augmentNoteEvidenceWithCited(base, ["work.md"], live);
    const workChunks = out.filter((m) => m.source === "work.md" && m.text === "The office VPN needs MTU 1380 on wg0.");
    expect(workChunks).toHaveLength(1);
  });

  it("is a no-op (returns the base evidence) when nothing is cited", () => {
    const out = augmentNoteEvidenceWithCited(base, [], live);
    expect(out).toEqual(base);
  });

  it("is a no-op when the cited note is not in the live corpus (a stale/invalid cite adds nothing)", () => {
    const out = augmentNoteEvidenceWithCited(base, ["ghost.md"], live);
    expect(out).toEqual(base);
  });

  it("never drops or rewrites base evidence — only appends (additive-only invariant)", () => {
    const out = augmentNoteEvidenceWithCited(base, ["home.md"], live);
    expect(out.slice(0, base.length)).toEqual(base);
    expect(out.length).toBeGreaterThan(base.length);
  });
});
