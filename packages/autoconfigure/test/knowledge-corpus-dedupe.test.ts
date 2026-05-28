import { describe, expect, it } from "vitest";

import { dedupeKnowledgeChunks } from "../src/knowledge-corpus.js";

describe("dedupeKnowledgeChunks — exact-duplicate passage suppression", () => {
  it("keeps the FIRST source of an exact-duplicate passage, drops the rest", () => {
    const out = dedupeKnowledgeChunks([
      { source: "notes/q3.md", text: "Q3 ad spend capped at 12k" },
      { source: "notes/ingested/budget.pdf", text: "Q3 ad spend capped at 12k" }, // dup from ingest
      { source: "notes/trip.md", text: "flight to Rome on the 14th" }
    ]);
    expect(out.map((c) => c.source)).toEqual(["notes/q3.md", "notes/trip.md"]);
  });

  it("treats whitespace-only differences as duplicates", () => {
    const out = dedupeKnowledgeChunks([
      { source: "a", text: "the   quarterly  review" },
      { source: "b", text: "the quarterly review" }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe("a");
  });

  it("drops empty / whitespace-only passages", () => {
    const out = dedupeKnowledgeChunks([
      { source: "a", text: "   " },
      { source: "b", text: "real content" }
    ]);
    expect(out.map((c) => c.source)).toEqual(["b"]);
  });

  it("preserves order and distinct passages", () => {
    const chunks = [
      { source: "a", text: "one" },
      { source: "b", text: "two" },
      { source: "c", text: "three" }
    ];
    expect(dedupeKnowledgeChunks(chunks)).toEqual(chunks);
  });

  it("is a no-op for an empty corpus", () => {
    expect(dedupeKnowledgeChunks([])).toEqual([]);
  });
});
