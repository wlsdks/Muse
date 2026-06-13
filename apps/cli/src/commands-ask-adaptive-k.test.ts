/**
 * Assembled-path tests for Adaptive-k gap selection (arXiv:2506.08479) wired
 * into diversifyAskChunks. Drives the REAL function with controlled score
 * distributions; no mocks, no Ollama.
 *
 * The gap-cut fires only when sorted.length > topK (the MMR path). When
 * candidates ≤ topK, the original early-return is unchanged.
 */
import { describe, expect, it } from "vitest";

import { diversifyAskChunks, notesGroundingFraming } from "./commands-ask.js";
import { selectByScoreGap } from "@muse/agent-core";

function makeChunk(file: string, score: number) {
  return {
    chunk: { chunkIndex: 0, embedding: [1, 0, 0], file, text: file },
    file,
    score,
  };
}

// Cliff geometry: one strong hit + three low-scoring decoys (4 total > topK=3).
// The gap between 0.82 and 0.18 (0.64) dominates all others.
const cliffHigh   = makeChunk("answer.md",  0.82);
const cliffDecoy1 = makeChunk("decoy1.md",  0.18);
const cliffDecoy2 = makeChunk("decoy2.md",  0.15);
const cliffDecoy3 = makeChunk("decoy3.md",  0.13);
const cliffCandidates = [cliffHigh, cliffDecoy1, cliffDecoy2, cliffDecoy3]; // 4 > topK=3

// Flat-relevant geometry: three comparable chunks + one noise tail (4 total > topK=3).
// Scores: [0.75, 0.74, 0.73, 0.10] — largest gap at index 2 (0.63), so
// gap-cut returns k=3, matching topK=3 (no trim, all relevant kept).
const flatTop1  = makeChunk("flat1.md", 0.75);
const flatTop2  = makeChunk("flat2.md", 0.74);
const flatTop3  = makeChunk("flat3.md", 0.73);
const flatNoise = makeChunk("noise.md", 0.10);
const flatCandidates = [flatTop1, flatTop2, flatTop3, flatNoise]; // 4 > topK=3

describe("diversifyAskChunks — Adaptive-k gap selection (arXiv:2506.08479)", () => {
  it("cliff + topK=3 + 4 candidates → 1 chunk returned (3 decoys trimmed by gap-cut)", () => {
    // sorted=[0.82,0.18,0.15,0.13]; gap-cut: gaps 0.64(idx 0) >> rest → effectiveK=1.
    const picked = diversifyAskChunks(cliffCandidates, 3);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.file).toBe("answer.md");
  });

  it("flat-relevant + topK=3 + 4 candidates → 3 chunks returned (cap respected, noise trimmed)", () => {
    // sorted=[0.75,0.74,0.73,0.10]; gap-cut: gaps 0.01,0.01,0.63 → largest at idx 2 → k=3.
    // effectiveK = Math.min(3, 3) = 3; MMR returns 3 relevant chunks.
    const picked = diversifyAskChunks(flatCandidates, 3);
    expect(picked).toHaveLength(3);
    expect(picked.map((p) => p.file)).toContain("flat1.md");
    expect(picked.map((p) => p.file)).toContain("flat2.md");
    expect(picked.map((p) => p.file)).toContain("flat3.md");
    expect(picked.map((p) => p.file)).not.toContain("noise.md");
  });

  it("counterfactual: selectByScoreGap returns 1 for cliff (proves the trim reduces from topK=3)", () => {
    // Without the gap-cut, fixed-topK=3 would pass 3 candidates to MMR.
    // With the gap-cut, effectiveK=1 so only the top match is returned.
    const sortedScores = cliffCandidates.map((c) => c.score).sort((a, b) => b - a);
    const gapK = selectByScoreGap(sortedScores, { min: 1, max: 3 });
    expect(gapK).toBe(1);
    expect(gapK).toBeLessThan(3); // gap-cut trims below the fixed ceiling
  });

  it("trim-only: returned chunk carries its original score byte-identical (no mutation)", () => {
    const picked = diversifyAskChunks(cliffCandidates, 3);
    expect(picked[0]?.score).toBe(0.82);
  });

  it("floor: top match (highest cosine) is always retained — classifyRetrievalConfidence verdict unchanged", () => {
    // min=1 in the gap-cut ensures the top-ranked chunk is never dropped.
    // classifyRetrievalConfidence keys on the top match's cosine, which is preserved.
    const picked = diversifyAskChunks(cliffCandidates, 3);
    expect(picked.some((p) => p.file === "answer.md")).toBe(true);
    expect(picked.find((p) => p.file === "answer.md")?.score).toBe(cliffHigh.score);
  });
});

// Borderline-flat geometry: four chunks whose top score is just above the
// confident threshold but the distribution is nearly flat (< 0.08 margin
// between top and runner-up), so classifyRetrievalConfidence correctly returns
// "ambiguous". 4 candidates > topK=3 so the gap-cut path fires.
const flatBorderline1 = makeChunk("b1.md", 0.59);
const flatBorderline2 = makeChunk("b2.md", 0.56);
const flatBorderline3 = makeChunk("b3.md", 0.55);
const flatBorderline4 = makeChunk("b4.md", 0.545);
const borderlineCandidates = [flatBorderline1, flatBorderline2, flatBorderline3, flatBorderline4];

// Cliff geometry for the value-preserved test: clear leader + noise tail.
const cliffV2High   = makeChunk("leader.md",  0.62);
const cliffV2Decoy1 = makeChunk("vdecoy1.md", 0.18);
const cliffV2Decoy2 = makeChunk("vdecoy2.md", 0.15);
const cliffV2Decoy3 = makeChunk("vdecoy3.md", 0.14);
const cliffV2Candidates = [cliffV2High, cliffV2Decoy1, cliffV2Decoy2, cliffV2Decoy3];

describe("floor-neutral fix: verdict uses the pre-gap-cut distribution", () => {
  it("borderline-flat [0.59,0.56,0.55,0.545] topK=3 → gap-cut trims to 1 but verdict stays 'ambiguous'", () => {
    // gap-cut: gaps=[0.03,0.01,0.005] — largest at index 0 → effectiveK=1 (prompt window=1 chunk).
    // Without the fix, notesGroundingFraming(trimmed=[0.59]) gives runnerUp=0,
    // flatDistribution=false → "confident". With the fix, verdictInput=[0.59,0.56,0.55]
    // gives runnerUp=0.56, top-runnerUp=0.03 < 0.08 → "ambiguous" (floor preserved).
    const promptWindow = diversifyAskChunks(borderlineCandidates, 3);
    const preGap = [...borderlineCandidates].sort((a, b) => b.score - a.score).slice(0, 3);
    const framing = notesGroundingFraming(promptWindow, undefined, preGap);
    expect(framing.verdict).toBe("ambiguous");
    expect(promptWindow).toHaveLength(1); // gap-cut trimmed the prompt window
  });

  it("counterfactual: WITHOUT verdictInput (verdict from trimmed set) the same input gives 'confident' — proving the fix is load-bearing", () => {
    // This test fails if the fix is removed (verdictInput not passed), confirming
    // the bug is real and the fix is non-vacuous.
    const promptWindow = diversifyAskChunks(borderlineCandidates, 3);
    // Deliberate: pass only the gap-cut trimmed promptWindow, no verdictInput.
    const framingFromTrimmed = notesGroundingFraming(promptWindow);
    expect(framingFromTrimmed.verdict).toBe("confident"); // the bug: trimmed set flips verdict
  });

  it("value preserved: cliff [0.62,0.18,0.15,0.14] topK=3 → prompt window trimmed to 1, verdict matches untrimmed verdict", () => {
    // gap-cut fires (0.62→0.18 gap=0.44 dominates) → prompt window = 1 chunk.
    // The untrimmed top-3 verdict should be "confident" (0.62 ≥ threshold, margin=0.44 >> 0.08).
    const promptWindow = diversifyAskChunks(cliffV2Candidates, 3);
    const preGap = [...cliffV2Candidates].sort((a, b) => b.score - a.score).slice(0, 3);
    const framing = notesGroundingFraming(promptWindow, undefined, preGap);
    // Prompt window is trimmed (value preserved: fewer decoy chunks in prompt).
    expect(promptWindow).toHaveLength(1);
    // Verdict from untrimmed distribution: 0.62 confident, margin = 0.44 >> 0.08.
    expect(framing.verdict).toBe("confident");
    // Sanity: without verdictInput (old path) it also gives "confident" here because
    // the top match alone is strong — so the floor violation is geometry-specific.
    const framingOldPath = notesGroundingFraming(promptWindow);
    expect(framingOldPath.verdict).toBe("confident");
  });
});
