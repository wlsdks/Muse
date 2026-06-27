import { describe, expect, it } from "vitest";

import { GROUNDING_EVAL_CORPUS, faithfulnessTripwireSubset } from "./grounding-eval-corpus.js";

const countKind = (cases: typeof GROUNDING_EVAL_CORPUS.cases, kind: string) =>
  cases.filter((c) => c.kind === kind).length;

describe("faithfulnessTripwireSubset — fast pre-push subset that NEVER weakens the fabrication gate", () => {
  it("keeps EVERY drift + refuse case (the faithfulness/abstain metrics are identical to the full corpus)", () => {
    const sub = faithfulnessTripwireSubset(GROUNDING_EVAL_CORPUS);
    expect(countKind(sub.cases, "drift")).toBe(countKind(GROUNDING_EVAL_CORPUS.cases, "drift"));
    expect(countKind(sub.cases, "refuse")).toBe(countKind(GROUNDING_EVAL_CORPUS.cases, "refuse"));
  });

  it("samples answerable DOWN (the false-refusal quality denominator, the slow reverify bulk)", () => {
    const sub = faithfulnessTripwireSubset(GROUNDING_EVAL_CORPUS, 6);
    expect(countKind(sub.cases, "answerable")).toBe(6);
    expect(countKind(GROUNDING_EVAL_CORPUS.cases, "answerable")).toBeGreaterThan(6);
  });

  it("the subset is strictly smaller — fewer live reverify calls => a faster push", () => {
    expect(faithfulnessTripwireSubset(GROUNDING_EVAL_CORPUS).cases.length)
      .toBeLessThan(GROUNDING_EVAL_CORPUS.cases.length);
  });

  it("keeps the full notes corpus (retrieval must still see every passage)", () => {
    expect(faithfulnessTripwireSubset(GROUNDING_EVAL_CORPUS).notes).toEqual(GROUNDING_EVAL_CORPUS.notes);
  });

  it("never empties answerable even at sample 0 (a tripwire still needs a faithful-answer sanity case)", () => {
    expect(countKind(faithfulnessTripwireSubset(GROUNDING_EVAL_CORPUS, 0).cases, "answerable")).toBe(1);
  });
});
