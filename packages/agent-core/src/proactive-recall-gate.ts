/**
 * Confidence-gated proactive recall — Phase 3 (the north star) of
 * docs/strategy/identity.md. Proactivity reuses the SAME deterministic CRAG
 * gate that makes cited recall trustworthy: when a deterministic trigger fires
 * (a due task, an imminent meeting), Muse recalls related passages from the
 * user's own corpus and surfaces a cited "here's the related doc" finding ONLY
 * when the recall is CONFIDENT. On a weak or empty recall it stays SILENT —
 * never a low-confidence guess appended to an unasked notice.
 *
 * This is what earns proactivity: the gate must prove it can stay quiet. The
 * 8B never decides relevance — the absolute-cosine threshold does, exactly as
 * in the wedge. Pure `decideProactiveRecall` + a ready-to-wire investigator
 * that fits the proactive loop's `investigate` seam.
 */

import {
  classifyRetrievalConfidence,
  lexicalOverlap,
  lexicalTokens,
  rankKnowledgeChunks,
  type KnowledgeChunk,
  type KnowledgeMatch,
  type RetrievalConfidence
} from "./knowledge-recall.js";

export interface ProactiveRecallDecision {
  /** True only when the recall is confident enough to surface unasked. */
  readonly surface: boolean;
  readonly confidence: RetrievalConfidence;
  /** The cited one-liner to append — present only when `surface` is true. */
  readonly finding?: string;
  /** Why it did or didn't surface (for logging / audit). */
  readonly reason: string;
}

const DEFAULT_MAX_CHARS = 160;

/**
 * Pick the excerpt of a matched chunk to QUOTE in the proactive finding. The
 * chunk matched the item as a whole (embedding), but its RELEVANT line can sit
 * anywhere — so quoting the opening shows a non-sequitur ("Project kickoff…")
 * when the reason it surfaced is a sentence further down ("Mom's birthday is
 * June 12th"). Centre the snippet on the sentence with the most query overlap so
 * the unasked nudge shows WHY it's related. No lexical signal (purely semantic
 * match) or a short chunk ⇒ fall back to the opening — never worse than before.
 */
function selectRelevantExcerpt(text: string, queryTokens: ReadonlySet<string>, maxChars: number): string {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  if (collapsed.length <= maxChars) {
    return collapsed;
  }
  const segments = collapsed.split(/(?<=[.!?])\s+/u).filter((s) => s.trim().length > 0);
  if (queryTokens.size > 0 && segments.length > 1) {
    let best = "";
    let bestScore = 0;
    for (const segment of segments) {
      const score = lexicalOverlap(queryTokens as Set<string>, segment);
      if (score > bestScore) {
        bestScore = score;
        best = segment.trim();
      }
    }
    if (bestScore > 0) {
      return best.length > maxChars ? `${best.slice(0, maxChars)}…` : best;
    }
  }
  return `${collapsed.slice(0, maxChars)}…`;
}

/**
 * Pure gate: given ranked matches, decide whether to surface a proactive
 * finding. CONFIDENT → a cited snippet from the top match; AMBIGUOUS / NONE →
 * stay silent. The snippet quotes the top match's `[source]` so the unasked
 * notice is as verifiable as a `muse ask` answer. Pass `query` (the triggering
 * item's title) so the snippet is the RELEVANT sentence, not the chunk opening.
 */
export function decideProactiveRecall(
  matches: readonly KnowledgeMatch[],
  options?: { readonly confidentAt?: number; readonly maxChars?: number; readonly query?: string }
): ProactiveRecallDecision {
  const confidence = classifyRetrievalConfidence(matches, options);
  if (confidence !== "confident") {
    return {
      confidence,
      reason: confidence === "none" ? "no matching passages — stay silent" : "recall too weak to surface unasked — stay silent",
      surface: false
    };
  }
  const top = [...matches].sort((a, b) => (b.cosine ?? b.score) - (a.cosine ?? a.score))[0]!;
  const maxChars = options?.maxChars && options.maxChars > 0 ? Math.trunc(options.maxChars) : DEFAULT_MAX_CHARS;
  const queryTokens = options?.query ? lexicalTokens(options.query) : new Set<string>();
  const snippet = selectRelevantExcerpt(top.text, queryTokens, maxChars);
  return {
    confidence,
    finding: `📎 Related in your notes — [${top.source}] ${snippet}`,
    reason: "confident recall",
    surface: true
  };
}

export interface ConfidenceGatedInvestigatorDeps {
  /** The corpus chunks, or a lazy provider (so the index is re-read per tick). */
  readonly chunks: readonly KnowledgeChunk[] | (() => Promise<readonly KnowledgeChunk[]>);
  readonly embed: (text: string) => Promise<readonly number[]>;
  readonly confidentAt?: number;
  readonly topK?: number;
  readonly maxChars?: number;
}

/**
 * Build an `investigate(item)` for the proactive loop that recalls over the
 * corpus and applies `decideProactiveRecall`. Fail-open: any error / empty
 * corpus / weak recall yields `undefined` (the loop omits the finding and the
 * base notice still fires). Re-embeds chunks via `rankKnowledgeChunks`, so it
 * fits a small corpus or a contract-faithful test; large pre-embedded indexes
 * should build matches directly and call `decideProactiveRecall`.
 */
export function createConfidenceGatedInvestigator(
  deps: ConfidenceGatedInvestigatorDeps
): (item: { readonly title: string; readonly kind: string; readonly factSheet: string }) => Promise<string | undefined> {
  return async (item) => {
    const query = item.title.trim();
    if (query.length === 0) return undefined;
    let chunks: readonly KnowledgeChunk[];
    try {
      chunks = typeof deps.chunks === "function" ? await deps.chunks() : deps.chunks;
    } catch {
      return undefined;
    }
    if (chunks.length === 0) return undefined;
    let matches: readonly KnowledgeMatch[];
    try {
      matches = await rankKnowledgeChunks(query, chunks, {
        embed: deps.embed,
        hybrid: true,
        ...(deps.topK !== undefined ? { topK: deps.topK } : {})
      });
    } catch {
      return undefined;
    }
    const decision = decideProactiveRecall(matches, {
      query,
      ...(deps.confidentAt !== undefined ? { confidentAt: deps.confidentAt } : {}),
      ...(deps.maxChars !== undefined ? { maxChars: deps.maxChars } : {})
    });
    return decision.surface ? decision.finding : undefined;
  };
}
