import {
  buildGroundingReverifyPrompt,
  parseGroundingReverifyVerdict,
  rankKnowledgeChunks,
  REVERIFY_SYSTEM_PROMPT,
  scoreGroundingEval,
  verifyGroundingWithReverify
} from "@muse/agent-core";
import type { GroundingEvalCorpus, GroundingEvalResult, GroundingReverify, GroundingVerification } from "@muse/agent-core";
import type { ModelProvider } from "@muse/model";

export interface GroundingThresholds {
  /** Faithfulness (fabrication caught) must be at or above this to pass. */
  readonly minFaithfulness: number;
  /** False-refusal (in-corpus answer wrongly refused) must be at or below this to pass. */
  readonly maxFalseRefusal: number;
}

/**
 * Shipped pass/fail bar — a REGRESSION FLOOR, set one miss below the live
 * baseline the honest current gate clears on the bundled corpus (measured
 * deterministically at faithfulness 0.92 = 12/13 caught, false-refusal 0.08 =
 * 1/12, on nomic-embed-text + qwen3:8b). The single uncaught case is the
 * compressed-cosine near-miss reranking/calibration will fix — so faithfulness
 * has headroom toward 1.0 and this floor rises as those land.
 */
export const GROUNDING_THRESHOLDS: GroundingThresholds = {
  maxFalseRefusal: 0.25,
  minFaithfulness: 0.84
};

export interface RunGroundingEvalDeps {
  readonly embed: (text: string) => Promise<readonly number[]>;
  readonly reverify: GroundingReverify;
  readonly topK?: number;
  /**
   * "off" runs the SAME retrieval but disables the grounding verdict — the
   * ablation arm that isolates the gate's contribution from the model. It lives
   * ONLY here, in the eval harness (no production `--no-grounding-gate` flag), so
   * the fail-closed seam is never given an opt-out. Default "on".
   */
  readonly gate?: "on" | "off";
}

/** The gate-OFF verdict: every answer passes, nothing is dropped — what the bare model ships without the gate. */
const GATE_OFF_VERDICT: GroundingVerification = {
  invalidCitations: [],
  reason: "gate disabled (ablation arm)",
  rubric: { answerability: 1, citationValidity: 1, confidence: 1, coverage: 1 },
  verdict: "grounded"
};

/** Wire the pure scorer to the REAL recall + RGV stack (live embeddings + weak-band judge). */
export function runGroundingEval(corpus: GroundingEvalCorpus, deps: RunGroundingEvalDeps): Promise<GroundingEvalResult> {
  const topK = deps.topK ?? 4;
  const rank = (query: string) =>
    rankKnowledgeChunks(query, corpus.notes, { diversify: true, embed: deps.embed, hybrid: true, topK });
  if (deps.gate === "off") {
    return scoreGroundingEval(corpus, { classify: () => "confident", rank, verify: () => Promise.resolve(GATE_OFF_VERDICT) });
  }
  return scoreGroundingEval(corpus, {
    rank,
    verify: (answer, matches, query) => verifyGroundingWithReverify(answer, matches, query, deps.reverify)
  });
}

/** The one-shot local-Qwen grounding judge the weak band spends a second inference on. */
export function createQwenReverify(modelProvider: ModelProvider, model: string): GroundingReverify {
  return async ({ answer, evidence, query }) => {
    const response = await modelProvider.generate({
      maxOutputTokens: 8,
      messages: [
        { content: REVERIFY_SYSTEM_PROMPT, role: "system" },
        { content: buildGroundingReverifyPrompt({ answer, evidence, query }), role: "user" }
      ],
      model,
      temperature: 0
    });
    return parseGroundingReverifyVerdict(response.output ?? "");
  };
}

export interface GroundingReport {
  readonly status: "ok" | "fail";
  readonly text: string;
}

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

/** Pure render of the two rates + failing cases, with the pass/fail verdict — testable without Ollama. */
export function renderGroundingEvalReport(result: GroundingEvalResult, thresholds: GroundingThresholds): GroundingReport {
  const faithOk = result.faithfulnessRate >= thresholds.minFaithfulness;
  const refuseOk = result.falseRefusalRate <= thresholds.maxFalseRefusal;
  const lines = [
    `grounding edge — ${result.total.toString()} cases (${result.answerable.toString()} answerable, ${result.refuse.toString()} must-refuse, ${result.drift.toString()} drift):`,
    `  faithfulness   ${result.faithfulnessRate.toFixed(2)}  (${result.caught.toString()}/${result.guardable.toString()} unfaithful answers caught)  ${faithOk ? "✓" : `✗ below ${pct(thresholds.minFaithfulness)}`}`,
    `  false-refusal  ${result.falseRefusalRate.toFixed(2)}  (${result.falseRefusals.toString()}/${result.answerable.toString()} in-corpus answers wrongly refused)  ${refuseOk ? "✓" : `✗ above ${pct(thresholds.maxFalseRefusal)}`}`
  ];
  const failing = result.outcomes.filter((outcome) => !outcome.passed);
  if (failing.length > 0) {
    lines.push("  flagged cases:");
    for (const outcome of failing) {
      lines.push(`    · [${outcome.kind}] "${outcome.query}" — ${outcome.detail}${outcome.note ? ` (${outcome.note})` : ""}`);
    }
  }
  return { status: faithOk && refuseOk ? "ok" : "fail", text: lines.join("\n") };
}

export interface GroundingDeltaMeta {
  readonly model: string;
  readonly corpus: string;
  readonly at: string;
  readonly command: string;
}

const signed = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;

/**
 * Render the gate-ON vs gate-OFF ablation as a Markdown DELTA table. The headline
 * Muse can defend on a fixed small local model is NOT an absolute faithfulness
 * score (a bigger model beats that) — it is this DELTA: same model, same
 * retrieval, gate toggled, so the lift is the GATE's architectural contribution.
 * Same-model judge ⇒ internal-validity delta, not a public-leaderboard rank.
 */
export function renderGroundingDelta(on: GroundingEvalResult, off: GroundingEvalResult, meta: GroundingDeltaMeta): string {
  const dFaith = on.faithfulnessRate - off.faithfulnessRate;
  const dRefuse = on.falseRefusalRate - off.falseRefusalRate;
  return [
    "# Muse grounding gate — architectural delta (gate ON vs OFF)",
    "",
    "> Same fixed local model, same retrieval, same corpus — the ONLY variable is",
    "> whether Muse's deterministic grounding gate runs. The Δ is the gate's",
    "> contribution, isolated from the model. A bigger model would beat the absolute",
    "> faithfulness number; it cannot beat this Δ without the same gate. (Same-model",
    "> judge ⇒ an internal-validity delta, not a public-leaderboard rank.)",
    "",
    `- model: \`${meta.model}\``,
    `- corpus: ${meta.corpus} (${on.guardable.toString()} guardable + ${on.answerable.toString()} answerable cases)`,
    `- generated: ${meta.at} by \`${meta.command}\` — regenerated, never hand-edited`,
    "",
    "| arm | faithfulness (fabrication caught) | false-refusal (in-corpus answer wrongly refused) |",
    "|---|---|---|",
    `| gate **ON** | ${on.faithfulnessRate.toFixed(2)} (${on.caught.toString()}/${on.guardable.toString()}) | ${on.falseRefusalRate.toFixed(2)} (${on.falseRefusals.toString()}/${on.answerable.toString()}) |`,
    `| gate **OFF** | ${off.faithfulnessRate.toFixed(2)} (${off.caught.toString()}/${off.guardable.toString()}) | ${off.falseRefusalRate.toFixed(2)} (${off.falseRefusals.toString()}/${off.answerable.toString()}) |`,
    `| **Δ (ON − OFF)** | **${signed(dFaith)}** | ${signed(dRefuse)} |`,
    "",
    `**Reading:** with the gate OFF the fixed model lets ${(off.guardable - off.caught).toString()}/${off.guardable.toString()} fabrications through; the gate ON catches ${on.caught.toString()}/${on.guardable.toString()} — a ${signed(dFaith)} faithfulness lift the SAME model cannot reach alone, at a ${signed(dRefuse)} false-refusal cost.`,
    ""
  ].join("\n");
}
