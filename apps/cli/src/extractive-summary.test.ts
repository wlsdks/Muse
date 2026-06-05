import { describe, expect, it } from "vitest";

import { luhnSentenceScore, rankSentencesByLuhn, splitSentences, summarizeExtractive } from "./extractive-summary.js";

describe("splitSentences — verbatim, decimal-safe", () => {
  it("splits on .!? followed by whitespace and trims each piece", () => {
    expect(splitSentences("First one. Second two! Third three?")).toEqual(["First one.", "Second two!", "Third three?"]);
  });

  it("does NOT split a decimal (no space after the dot) — keeps it verbatim", () => {
    expect(splitSentences("The value is 3.14 today. Next sentence.")).toEqual(["The value is 3.14 today.", "Next sentence."]);
  });

  it("returns [] for empty / whitespace input and collapses internal whitespace", () => {
    expect(splitSentences("   ")).toEqual([]);
    expect(splitSentences("a  b\n c. d.")).toEqual(["a b c.", "d."]);
  });
});

describe("luhnSentenceScore — densest significant-word cluster", () => {
  const sig = new Set(["solar", "panel", "energy"]);

  it("scores 0 when a sentence has no significant words", () => {
    expect(luhnSentenceScore("the cat sat on the mat", sig, 4)).toBe(0);
  });

  it("rewards a tight cluster of significant words (sigCount^2 / windowLength)", () => {
    // "solar panel energy" — 3 significant in a window of 3 → 9/3 = 3.
    expect(luhnSentenceScore("solar panel energy", sig, 4)).toBeCloseTo(3, 5);
  });

  it("a spread-out pair scores lower than a tight pair (density, not just count)", () => {
    const tight = luhnSentenceScore("solar panel works", sig, 4); // window 2, count 2 → 4/2 = 2
    const spread = luhnSentenceScore("solar systems are a kind of panel", sig, 4); // count 2, window 6 → 4/6
    expect(tight).toBeGreaterThan(spread);
  });
});

describe("summarizeExtractive — Luhn (1958) top sentences in original order", () => {
  const doc = [
    "The solar panel project starts in March.",
    "Weather is nice today and the sky is blue.",
    "Our solar panel array will cut energy costs and the solar energy payback is three years.",
    "Lunch is at noon."
  ].join(" ");

  it("picks the densest topic sentence and returns the chosen set in document order", () => {
    const out = summarizeExtractive(doc, { maxSentences: 2 });
    expect(out.length).toBe(2);
    // The "solar panel array ... solar energy payback" sentence is the densest → always chosen.
    expect(out.some((s) => s.includes("solar energy payback"))).toBe(true);
    // Output preserves original document order (the chosen sentences are not re-sorted by score).
    const indices = out.map((s) => doc.indexOf(s));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("returns the document's OWN verbatim sentences (never reworded — no fabrication)", () => {
    for (const sentence of summarizeExtractive(doc, { maxSentences: 3 })) {
      expect(doc).toContain(sentence);
    }
  });

  it("defaults to 3 sentences, clamps maxSentences to >=1, and never returns more than exist", () => {
    expect(summarizeExtractive(doc).length).toBe(3);
    expect(summarizeExtractive(doc, { maxSentences: 0 }).length).toBe(1);
    expect(summarizeExtractive("Only one sentence here.", { maxSentences: 5 })).toEqual(["Only one sentence here."]);
  });

  it("returns [] for empty input", () => {
    expect(summarizeExtractive("")).toEqual([]);
    expect(summarizeExtractive("   \n  ")).toEqual([]);
  });

  it("rankSentencesByLuhn orders by score desc, original index breaking ties", () => {
    const ranked = rankSentencesByLuhn(doc);
    expect(ranked[0]!.sentence).toContain("solar energy payback"); // densest first
    expect(ranked.length).toBe(4);
  });
});
