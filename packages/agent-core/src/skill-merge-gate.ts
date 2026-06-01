/**
 * Held-out validation gate for the curator skill-merge — Muse's adaptation of
 * SkillOpt (Microsoft, MIT, arXiv 2605.23904): turn self-editing into
 * propose-and-test. The merger PROPOSES an umbrella; this gate TESTS it before
 * the store commits, so a destructive merge that silently drops one of the
 * cluster's skills is rejected and rolled back instead of overwriting.
 *
 * The held-out criterion for a CONSOLIDATION is no coverage regression: each
 * original skill's purpose must still be reachable through the umbrella. The
 * check is SEMANTIC, not lexical — a good consolidation GENERALISES (three
 * "summarise-email / -doc / -notes" skills become one "summarise content"), so
 * a lexical "must echo each skill's words" test false-rejects exactly the
 * behaviour we want. We embed each original's trigger (name + "Use when …"
 * description) and the umbrella's, and require cosine ≥ `floor`. Calibrated on
 * nomic-embed-text: a real generalised umbrella scores 0.76–0.84 against its
 * originals, an off-topic umbrella 0.51–0.59, cluster-internal 0.76–0.80 — so
 * the default 0.65 sits in the gap with margin (see the live battery
 * `verify-skill-merge.mjs`, which asserts no false-reject on a real merge).
 *
 * Fail-closed: if the embedder is unavailable the merge cannot be verified, so
 * it is rejected (deferred to a later idle tick) rather than committed blind —
 * SkillOpt's "accept only a verified edit". A small model is an unreliable
 * self-verifier (arXiv 2404.17140), so the gate is embeddings, not a model
 * self-judgement; the verdict shape leaves room for a rollout-based scorer.
 */

import { cosineSimilarity } from "./episodic-recall.js";
import type { SkillDraft } from "./skill-review.js";

export interface UmbrellaCoverageVerdict {
  /** Accept the umbrella (commit the merge) only when this is true. */
  readonly accept: boolean;
  /** Fraction of the cluster's skills whose purpose the umbrella still covers (0..1). */
  readonly score: number;
  /** Original skill names the umbrella covers. */
  readonly covered: readonly string[];
  /** Original skill names the umbrella dropped — the merge regression. */
  readonly lost: readonly string[];
  /** Human-readable summary for the action log / rejected-edit feedback. */
  readonly reason: string;
}

export interface ValidateUmbrellaOptions {
  /** Embed text to a vector (the local nomic embedder). Required — the gate is semantic. */
  readonly embed: (text: string) => Promise<readonly number[]>;
  /**
   * Cosine floor for an original to count as covered by the umbrella. Default
   * 0.65 — calibrated for nomic-embed-text (good coverage ≥0.76, off-topic
   * ≤0.59). Raise it to demand tighter coverage, lower it to tolerate looser
   * generalisation.
   */
  readonly floor?: number;
  /**
   * When true (default), accept only if EVERY original is covered — a
   * consolidation may generalise wording but must not lose a skill's purpose.
   * When false, accept when `score` reaches `minScore`.
   */
  readonly requireAllCovered?: boolean;
  /** Floor on `score` when `requireAllCovered` is false. Default 1.0. */
  readonly minScore?: number;
}

const DEFAULT_FLOOR = 0.65;

/** The trigger surface that decides whether the agent reaches for a skill. */
function triggerText(skill: SkillDraft): string {
  return `${skill.name}. ${skill.description}`;
}

/**
 * Grade an umbrella against the cluster it claims to replace, by semantic
 * coverage. Fail-closed: any embedding error → reject (cannot verify). An empty
 * cluster never accepts.
 */
export async function validateUmbrellaCoverage(
  cluster: readonly SkillDraft[],
  umbrella: SkillDraft,
  options: ValidateUmbrellaOptions
): Promise<UmbrellaCoverageVerdict> {
  if (cluster.length === 0) {
    return { accept: false, covered: [], lost: [], reason: "empty cluster", score: 0 };
  }
  const floor = clamp01(options.floor ?? DEFAULT_FLOOR);
  const requireAll = options.requireAllCovered ?? true;
  const minScore = clamp01(options.minScore ?? 1);

  let umbrellaVec: readonly number[];
  const skillVecs: (readonly number[])[] = [];
  try {
    umbrellaVec = await options.embed(triggerText(umbrella));
    for (const skill of cluster) {
      skillVecs.push(await options.embed(triggerText(skill)));
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      accept: false,
      covered: [],
      lost: cluster.map((s) => s.name),
      reason: `coverage gate could not run (embedder unavailable: ${message})`,
      score: 0
    };
  }

  const covered: string[] = [];
  const lost: string[] = [];
  cluster.forEach((skill, i) => {
    const cos = cosineSimilarity(skillVecs[i]!, umbrellaVec);
    if (cos >= floor) {
      covered.push(skill.name);
    } else {
      lost.push(skill.name);
    }
  });

  const score = covered.length / cluster.length;
  const accept = requireAll ? lost.length === 0 : score >= minScore;
  const reason = accept
    ? `umbrella "${umbrella.name}" covers all ${covered.length.toString()} skills (≥${floor.toFixed(2)})`
    : `umbrella "${umbrella.name}" drops [${lost.join(", ")}] (covered ${covered.length.toString()}/${cluster.length.toString()}, floor ${floor.toFixed(2)})`;

  return { accept, covered, lost, reason, score };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
