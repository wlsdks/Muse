import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLAYBOOK_CREDIT_COSINE,
  DEFAULT_PLAYBOOK_DECAY_CREDIT_COSINE,
  PLAYBOOK_CREDIT_MARGIN,
  PLAYBOOK_DECAY_CREDIT_MARGIN,
  selectCreditTargetSemantic
} from "../src/index.js";

// Semantic credit assignment for the playbook RL loop (Memory-R2 arXiv:2605.21768;
// mis-credited reward replays via experience-following arXiv:2505.16067). The
// strategy TEXT (terse imperative) and the feedback CUE (user prose) are different
// distributions — lexical Jaccard mis-/no-credits a paraphrase; embedding cosine
// picks the strategy the cue actually implicates.

// Controlled vectors: "true" strategy parallel to the cue, "decoy" orthogonal.
const VECS: Record<string, readonly number[]> = {
  cue: [1, 0, 0],
  true_match: [0.99, 0.01, 0], // ~parallel to cue
  decoy: [0, 1, 0] // orthogonal
};
const stubEmbed = async (text: string): Promise<readonly number[]> => VECS[text] ?? [0, 0, 1];

describe("selectCreditTargetSemantic (Memory-R2 arXiv:2605.21768)", () => {
  it("credits the SEMANTICALLY matching strategy, not a lexical decoy", async () => {
    const id = await selectCreditTargetSemantic(
      [{ id: "decoy-id", text: "decoy" }, { id: "true-id", text: "true_match" }],
      "cue",
      stubEmbed
    );
    expect(id).toBe("true-id");
  });

  it("returns undefined when nothing clears the cosine floor (caller falls back to lexical)", async () => {
    const id = await selectCreditTargetSemantic([{ id: "decoy-id", text: "decoy" }], "cue", stubEmbed);
    expect(id).toBeUndefined();
  });

  it("respects a custom threshold (a near-but-below match is not credited)", async () => {
    const id = await selectCreditTargetSemantic(
      [{ id: "true-id", text: "true_match" }],
      "cue",
      stubEmbed,
      0.99999 // above the ~0.99995 cosine of cue,true_match
    );
    expect(id).toBeUndefined();
  });

  it("picks the HIGHEST-cosine candidate when several clear the floor", async () => {
    const embed = async (t: string): Promise<readonly number[]> =>
      t === "cue" ? [1, 0, 0] : t === "near" ? [0.9, 0.4, 0] : [0.99, 0.01, 0];
    const id = await selectCreditTargetSemantic(
      [{ id: "near-id", text: "near" }, { id: "best-id", text: "best" }],
      "cue",
      embed
    );
    expect(id).toBe("best-id");
  });

  it("fail-soft: an embedder that throws returns undefined (lexical fallback path)", async () => {
    const throwing = async (): Promise<readonly number[]> => {
      throw new Error("embedder down");
    };
    expect(await selectCreditTargetSemantic([{ id: "x", text: "true_match" }], "cue", throwing)).toBeUndefined();
  });

  it("empty candidates or empty cue is undefined (no embed call needed)", async () => {
    let called = 0;
    const counting = async (t: string): Promise<readonly number[]> => {
      called += 1;
      return VECS[t] ?? [0, 0, 1];
    };
    expect(await selectCreditTargetSemantic([], "cue", counting)).toBeUndefined();
    expect(await selectCreditTargetSemantic([{ id: "x", text: "true_match" }], "   ", counting)).toBeUndefined();
    expect(called).toBe(0);
  });

  it("a candidate with no embedding is skipped, not credited (zero-vector safe)", async () => {
    const embed = async (t: string): Promise<readonly number[]> => (t === "blank" ? [] : VECS[t] ?? [0, 0, 1]);
    const id = await selectCreditTargetSemantic(
      [{ id: "blank-id", text: "blank" }, { id: "true-id", text: "true_match" }],
      "cue",
      embed
    );
    expect(id).toBe("true-id");
  });

  it("exports a sane default credit floor", () => {
    expect(DEFAULT_PLAYBOOK_CREDIT_COSINE).toBeGreaterThan(0);
    expect(DEFAULT_PLAYBOOK_CREDIT_COSINE).toBeLessThan(1);
  });
});

/**
 * Live-calibration regression pins (eval:playbook-credit). A feedback cue and a
 * strategy are DIFFERENT text distributions, so they do NOT score like
 * paraphrases: genuine pairs measure 0.30-0.58 while feedback that implicates
 * NOTHING still reaches 0.29 against its nearest strategy — the absolute bands
 * OVERLAP. The shipped 0.55/0.62 floors sat above the genuine band entirely, so
 * credit fired on 3/13 real cues and decay on 0/13 (dead code). The MARGIN is
 * what separates the populations: a genuine match beats the runner-up by 0.13
 * (median), a no-match cue's top-2 sit within 0.038.
 */
describe("selectCreditTargetSemantic — the margin gate (live-calibrated)", () => {
  // Vectors reproducing the measured geometry: the cue is CLOSE to its own
  // strategy and mid-distance from the rest.
  const V: Record<string, readonly number[]> = {
    "cue-clear": [1, 0, 0],
    "s-match": [0.95, 0.31, 0],      // cos ≈ 0.95 → top
    "s-other": [0.30, 0.95, 0],      // cos ≈ 0.30 → runner-up, margin ≈ 0.65
    "cue-ambiguous": [1, 0, 0],
    "s-near-a": [0.42, 0.91, 0],     // cos ≈ 0.42
    "s-near-b": [0.40, 0.92, 0]      // cos ≈ 0.40 → margin ≈ 0.02: a near-tie
  };
  const embed = async (text: string): Promise<readonly number[]> => V[text] ?? [0, 0, 1];

  it("credits the strategy that clearly stands out", async () => {
    const picked = await selectCreditTargetSemantic(
      [{ id: "a", text: "s-match" }, { id: "b", text: "s-other" }],
      "cue-clear",
      embed,
      0.3,
      0.05
    );
    expect(picked).toBe("a");
  });

  it("credits NOTHING on a near-tie — feedback that implicates nothing scores its top-2 within 0.04", async () => {
    const picked = await selectCreditTargetSemantic(
      [{ id: "a", text: "s-near-a" }, { id: "b", text: "s-near-b" }],
      "cue-ambiguous",
      embed,
      0.3,
      0.05
    );
    expect(picked).toBeUndefined();
  });

  it("a SOLE candidate has no runner-up, so it must clear the higher no-match floor alone", async () => {
    // cos ≈ 0.42 — above the credit floor (0.3) but below the solo floor (0.35)?
    // 0.42 > 0.35 → credited. A weaker sole match is not.
    const strong = await selectCreditTargetSemantic(
      [{ id: "a", text: "s-match" }],
      "cue-clear",
      embed,
      0.3,
      0.05
    );
    expect(strong).toBe("a");

    const weak = await selectCreditTargetSemantic(
      [{ id: "a", text: "s-other" }],
      "cue-clear",
      embed,
      0.3,
      0.05
    );
    // cos ≈ 0.30: clears the credit floor but NOT the solo floor (0.35).
    expect(weak).toBeUndefined();
  });

  it("the decay margin is stricter than the credit margin (asymmetric precision)", () => {
    expect(PLAYBOOK_DECAY_CREDIT_MARGIN).toBeGreaterThan(PLAYBOOK_CREDIT_MARGIN);
    expect(DEFAULT_PLAYBOOK_DECAY_CREDIT_COSINE).toBeGreaterThan(DEFAULT_PLAYBOOK_CREDIT_COSINE);
  });

  it("the floors sit INSIDE the measured genuine band, not above it", () => {
    // Genuine cue→strategy pairs measure 0.298-0.575 live. A floor at or above
    // ~0.6 (the old 0.55/0.62) rejects nearly all real feedback.
    expect(DEFAULT_PLAYBOOK_CREDIT_COSINE).toBeLessThan(0.4);
    expect(DEFAULT_PLAYBOOK_DECAY_CREDIT_COSINE).toBeLessThan(0.45);
  });
});
