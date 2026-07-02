/**
 * Multi-document knowledge recall (RAG) with source attribution.
 *
 * Episodic recall ranks ONE corpus (past conversation summaries).
 * This ranks a MULTI-source personal corpus — notes + ingested docs —
 * and keeps each passage's `source` so the agent can CITE which
 * document an answer came from. Source-agnostic by design: the caller
 * assembles `KnowledgeChunk`s from whatever stores it has (local
 * notes, an ingested PDF, …); the ranker only needs `{ source, text }`.
 *
 * Embedding-backed (cosine), local + zero-cost (Ollama in production,
 * a deterministic fake in tests). Reuses `cosineSimilarity` so the
 * scoring matches episodic recall.
 *
 * This module holds the recall SHAPING layer on top of the base ranker
 * (`knowledge-ranking.js`): edge-load presentation, set-level sufficiency,
 * the clarify gate, match rendering, and the second-hop / associative-bridge
 * augmentation of a primary ranking.
 */

import { buildNoteLinkGraph, personalizedPageRank } from "./associative-recall.js";
import { cosineSimilarity } from "./episodic-recall.js";
import {
  type KnowledgeChunk,
  type KnowledgeMatch,
  rankKnowledgeChunks,
  type RankKnowledgeOptions
} from "./knowledge-ranking.js";
import { reorderForLongContext } from "./recall-chunking.js";
import { classifyRetrievalConfidence, DEFAULT_CONFIDENT_AT } from "./recall-confidence.js";
import { finiteOr, fuseByReciprocalRank } from "./recall-lexical.js";

/**
 * Reorder relevance-ranked items so the MOST relevant sit at the
 * edges of the list (first + last) and the least relevant in the
 * middle, because language models attend best to the start and end of
 * their context and worst to the middle (Liu et al. 2023, "Lost in the
 * Middle: How Language Models Use Long Contexts", arXiv 2307.03172).
 * Input must be sorted best-first. Deterministic, no deps.
 */
export function edgeLoadByRelevance<T>(ranked: readonly T[]): T[] {
  const out = new Array<T>(ranked.length);
  let front = 0;
  let back = ranked.length - 1;
  ranked.forEach((item, index) => {
    if (index % 2 === 0) {
      out[front] = item;
      front += 1;
    } else {
      out[back] = item;
      back -= 1;
    }
  });
  return out;
}

/**
 * SET-LEVEL semantic sufficiency: a multi-part query is only covered when EVERY
 * sub-query has at least one passage above the coverage bar. A single strong
 * passage on sub-query A does not cover sub-query B — the top-cosine signal
 * misses this gap and the model fabricates the uncovered half.
 *
 * Sufficient Context (arXiv:2411.06037, Joren/Zhang/Ferng/Juan/Taly/Rashtchian,
 * ICLR 2025): sufficiency is a SET-LEVEL property orthogonal to per-passage
 * relevance; when context is insufficient, models fabricate instead of
 * abstaining.
 *
 * ADVISORY-ONLY: the result is never used to block an answer or relax the
 * citation gate. It powers one honest caveat naming the uncovered parts.
 * MULTI-PART-GATED: returns sufficient:true for single-intent queries — those
 * are the confidence gate's job.
 * FAIL-OPEN: degenerate/empty vecs → cosineSimilarity returns 0 → insufficient
 * → but empty subQueries or length<2 → sufficient:true.
 */
export interface SufficiencyVerdict {
  readonly sufficient: boolean;
  readonly coveredFraction: number;
  readonly uncovered: readonly string[];
}

export function assessContextSufficiency(
  subQueries: ReadonlyArray<{ readonly text: string; readonly vec: readonly number[] }>,
  evidenceVecs: readonly (readonly number[])[],
  options?: { readonly coverAt?: number; readonly sufficientAt?: number }
): SufficiencyVerdict {
  // Single-intent no-op: per-passage confidence gate already handles this.
  if (subQueries.length < 2) {
    return { sufficient: true, coveredFraction: 1, uncovered: [] };
  }
  // coverAt reuses DEFAULT_CONFIDENT_AT (0.55): calibrated on nomic-embed-text
  // against real personal notes — same bar used by classifyRetrievalConfidence.
  const coverAt = finiteOr(options?.coverAt, DEFAULT_CONFIDENT_AT);
  const sufficientAt = finiteOr(options?.sufficientAt, 1.0);

  const uncovered: string[] = [];
  for (const sq of subQueries) {
    let maxSim = 0;
    for (const ev of evidenceVecs) {
      const sim = cosineSimilarity(sq.vec as number[], ev as number[]);
      if (sim > maxSim) maxSim = sim;
    }
    if (maxSim < coverAt) {
      uncovered.push(sq.text);
    }
  }

  const covered = subQueries.length - uncovered.length;
  const coveredFraction = covered / subQueries.length;
  return {
    sufficient: coveredFraction >= sufficientAt,
    coveredFraction,
    uncovered
  };
}

// Near-tie band (cosine units) for the clarify gate. Two DISTINCT sources whose
// top cosines sit within this band are "equally relevant" — the open question is
// WHICH the user meant, not whether the corpus covers it. Tight (vs
// CONFIDENCE_MIN_MARGIN's 0.08) so only a genuine tie fires, never a clear lead;
// calibrated against nomic's compressed cosine space.
const DEFAULT_CLARIFY_TIE_MARGIN = 0.03;

export interface RecallClarification {
  /** True when distinct sources are equally-strong enough that asking beats guessing. */
  readonly clarify: boolean;
  /** The distinct divergent sources to offer, strongest first (empty unless `clarify`). */
  readonly sources: readonly string[];
  /** Why it did or didn't fire — for logging / tests. */
  readonly reason: string;
}

/**
 * Expected-information-gain gate (Lindley 1956, "On a Measure of the Information
 * Provided by an Experiment"; Howard 1966, value of perfect information): when
 * several retrieved sources are each independently strong, come from DISTINCT
 * sources, and are nearly TIED, the residual uncertainty is over WHICH reading
 * the user meant — so a single clarifying question carries the highest expected
 * information gain, more than silently answering the top one (it may be the wrong
 * reading) or abstaining (the corpus DOES cover it). One dominant source ⇒ low
 * entropy ⇒ just answer; nothing strong ⇒ abstain. Pure + deterministic so the
 * small model can't flake the decision — the THIRD arm of the recall wedge
 * (answer / clarify / abstain), alongside `classifyRetrievalConfidence`.
 */
export function decideRecallClarification(
  matches: readonly KnowledgeMatch[],
  options?: { readonly confidentAt?: number; readonly tieMargin?: number; readonly maxSources?: number }
): RecallClarification {
  const confidentAt = finiteOr(options?.confidentAt, DEFAULT_CONFIDENT_AT);
  const tieMargin = Math.max(0, finiteOr(options?.tieMargin, DEFAULT_CLARIFY_TIE_MARGIN));
  const maxSources = Math.max(2, Math.trunc(finiteOr(options?.maxSources, 3)));
  // Best score per DISTINCT source: several chunks of the SAME note are one
  // candidate, not a tie — there is no ambiguity within a single source.
  const bestBySource = new Map<string, number>();
  for (const match of matches) {
    const value = match.cosine ?? match.score;
    const prev = bestBySource.get(match.source);
    if (prev === undefined || value > prev) bestBySource.set(match.source, value);
  }
  const strong = [...bestBySource.entries()]
    .filter(([, value]) => value >= confidentAt)
    .sort((left, right) => right[1] - left[1]);
  if (strong.length < 2) {
    return { clarify: false, reason: strong.length === 1 ? "one dominant source — answer it" : "no strong source — abstain", sources: [] };
  }
  const top = strong[0]![1];
  const tied = strong.filter(([, value]) => top - value <= tieMargin);
  if (tied.length < 2) {
    return { clarify: false, reason: "top source clearly leads — answer it", sources: [] };
  }
  return {
    clarify: true,
    reason: `${tied.length.toString()} distinct sources within ${tieMargin.toString()} of the top — high expected information gain from clarifying`,
    sources: tied.slice(0, maxSources).map(([source]) => source)
  };
}

export function renderKnowledgeMatches(matches: readonly KnowledgeMatch[], options?: { readonly confidentAt?: number }): string {
  if (matches.length === 0) {
    return "No matching passages found in the personal corpus.";
  }
  const verdict = classifyRetrievalConfidence(matches, options);
  const header = verdict === "ambiguous"
    ? "Possibly-related passages (LOW confidence — verify before relying; do not cite as established fact):"
    : "Relevant passages — cite the [source] you use:";
  const lines = [header];
  // Edge-place the passages (strongest at the head + tail, weakest in the
  // middle) so the local model attends to the best grounding — same
  // "Lost in the Middle" reorder `muse ask` applies to its notes block.
  for (const match of reorderForLongContext(matches)) {
    lines.push(`— [${match.source}] ${match.text}`);
  }
  return lines.join("\n");
}

/**
 * Embed a match's text for dedup comparison, preferring the input chunk's
 * `embedText` (the same embedding space used during ranking — a cache hit).
 * Returns null on any embed failure so the dedup stays fail-open.
 */
async function embedChunkVec(
  inputChunk: KnowledgeChunk | undefined,
  match: KnowledgeMatch,
  embed: (text: string) => Promise<readonly number[]>
): Promise<readonly number[] | null> {
  try {
    return await embed(inputChunk?.embedText ?? match.text);
  } catch {
    return null;
  }
}

/**
 * Drop a candidate bridge/addition that is a near-duplicate of a chunk already
 * kept (a primary hit OR an earlier-kept addition). Mirrors the ask-window
 * `dedupNearDuplicateChunks` (@muse/recall) on the ENGINE path: a hop/PPR
 * bridge can surface a chunk near-identical to a primary (same fact across two
 * notes, or a bridge adjacent to a seed) and pad the small model's grounding
 * window with redundancy. Greedy first-wins so the higher-ranked chunk survives.
 *
 * AUGMENT-never-displace + FAIL-OPEN: only candidate ADDITIONS are filtered —
 * the primary ranking is never touched. Each chunk's embedding is fetched via
 * the (caching) embedder; a degenerate/length-mismatched vec yields cosine 0
 * (< threshold) so it never registers as a duplicate, and an embed FAILURE
 * keeps the candidate. Redundancy is dropped only on a confident match.
 */
async function dropNearDuplicateAdditions(
  kept: readonly KnowledgeMatch[],
  additions: readonly KnowledgeMatch[],
  embedFor: (match: KnowledgeMatch) => Promise<readonly number[] | null>,
  threshold = 0.985
): Promise<KnowledgeMatch[]> {
  if (additions.length === 0) return [];
  const keptVecs: (readonly number[])[] = [];
  for (const match of kept) {
    const vec = await embedFor(match);
    if (vec !== null) keptVecs.push(vec);
  }
  const survivors: KnowledgeMatch[] = [];
  for (const candidate of additions) {
    const vec = await embedFor(candidate);
    const isNearDup =
      vec !== null && keptVecs.some((kv) => cosineSimilarity(vec, kv) >= threshold);
    if (!isNearDup) {
      survivors.push(candidate);
      if (vec !== null) keptVecs.push(vec);
    }
  }
  return survivors;
}

/**
 * Append up to 2 associative bridges to `primary` using PPR over the
 * note-link graph (HippoRAG 2, arXiv:2502.14802). Seed weights = primary
 * match scores; appended bridges carry a query-relative cosine (or 0 on
 * embed failure). Primary list is never mutated.
 */
async function appendAssociativeBridges(
  query: string,
  primary: readonly KnowledgeMatch[],
  notes: readonly KnowledgeChunk[],
  options: RankKnowledgeOptions
): Promise<KnowledgeMatch[]> {
  if (primary.length === 0) {
    return [...primary];
  }
  const keyOf = (chunk: KnowledgeChunk | KnowledgeMatch): string =>
    `${chunk.source}|${chunk.text}`;

  const graph = buildNoteLinkGraph(notes);
  const seeds = new Map<string, number>();
  for (const match of primary) {
    seeds.set(keyOf(match), Math.max(match.cosine ?? match.score, 0));
  }

  const pprScores = personalizedPageRank(graph, seeds);
  const primaryKeys = new Set(primary.map((m) => keyOf(m)));

  // arXiv:2502.14802 §3.2: only nodes genuinely reached by the PPR walk
  // (score > 0) qualify as bridges; zero-score nodes were never traversed.
  const bridgeCandidates = [...pprScores.entries()]
    .filter(([key, score]) => !primaryKeys.has(key) && score > 1e-9)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key);

  const inputByKey = new Map<string, KnowledgeChunk>();
  for (const chunk of notes) {
    inputByKey.set(keyOf(chunk), chunk);
  }

  let queryVec: readonly number[] | null = null;
  try {
    queryVec = await options.embed(query);
  } catch {
    // fail-safe: bridges get cosine=0
  }

  const additions: KnowledgeMatch[] = [];
  for (const key of bridgeCandidates) {
    const chunk = inputByKey.get(key);
    if (!chunk) continue;
    let queryCosine = 0;
    if (queryVec !== null) {
      try {
        const chunkVec = await options.embed(chunk.embedText ?? chunk.text);
        queryCosine = cosineSimilarity(queryVec, chunkVec);
      } catch {
        queryCosine = 0;
      }
    }
    additions.push({ cosine: queryCosine, score: queryCosine, source: chunk.source, text: chunk.text });
  }

  const deduped = await dropNearDuplicateAdditions(primary, additions, (match) =>
    embedChunkVec(inputByKey.get(keyOf(match)), match, options.embed)
  );
  return [...primary, ...deduped];
}

/**
 * Deterministic second-hop retrieval (pseudo-relevance feedback, Rocchio
 * lineage): a two-hop question ("the team of the person who recommended the
 * book") names only hop 1 — the bridging note shares no tokens with the
 * query, so single-shot recall measured 2/6 joint@4 on the multi-hop battery.
 * Re-query with the TOP primary hits' own text (the bridge entity lives
 * there), then RRF-merge primary + hop lists. Zero model calls — two extra
 * embeds; `secondHop` is opt-in so the base path is byte-identical without it.
 */
export async function rankKnowledgeChunksWithHop(
  query: string,
  notes: readonly KnowledgeChunk[],
  options: RankKnowledgeOptions & { readonly secondHop?: boolean; readonly associative?: boolean }
): Promise<KnowledgeMatch[]> {
  const primary = await rankKnowledgeChunks(query, notes, options);
  if (options.secondHop !== true && options.associative !== true) {
    return primary;
  }
  if (options.secondHop !== true && options.associative === true) {
    return appendAssociativeBridges(query, primary, notes, options);
  }
  if (primary.length === 0) {
    return primary;
  }
  const keyOf = (match: KnowledgeMatch): string => `${match.source}|${match.text}`;
  const byKey = new Map<string, KnowledgeMatch>();
  const lists: string[][] = [primary.map((match) => { byKey.set(keyOf(match), match); return keyOf(match); })];
  for (const seed of primary.slice(0, 2)) {
    try {
      const hop = await rankKnowledgeChunks(seed.text, notes, options);
      lists.push(hop.map((match) => {
        const key = keyOf(match);
        const known = byKey.get(key);
        if (!known || (match.cosine ?? 0) > (known.cosine ?? 0)) byKey.set(key, match);
        return key;
      }));
    } catch {
      // hop retrieval is best-effort — a failed hop keeps the primary list
    }
  }
  // AUGMENT, never displace: the primary ranking is the measured single-hop
  // optimum (hit@1 15/15), so it keeps its exact order; hop-only bridges are
  // APPENDED (best-fused first, max 2) — multi-hop gains joint coverage while
  // single-hop behavior stays byte-identical.
  const fused = fuseByReciprocalRank(lists);
  const primaryKeys = new Set(primary.map((match) => keyOf(match)));

  // Recompute cosine for appended bridges against the ORIGINAL QUERY so
  // additions carry query-relative confidence, not seed-relative (inflated) cosine.
  // The caching embedder makes these cache hits — the same texts were already
  // embedded during the primary and hop ranking passes above.
  let queryVec: readonly number[] | null = null;
  try {
    queryVec = await options.embed(query);
  } catch {
    // If the query embed fails, fall back: all additions get cosine=0 (fail-safe below).
  }

  const inputByKey = new Map<string, KnowledgeChunk>();
  for (const chunk of notes) {
    inputByKey.set(`${chunk.source}|${chunk.text}`, chunk);
  }

  const additionKeys = [...byKey.keys()]
    .filter((key) => !primaryKeys.has(key))
    .sort((a, b) => (fused.get(b) ?? 0) - (fused.get(a) ?? 0))
    .slice(0, 2);

  const additions: KnowledgeMatch[] = [];
  for (const key of additionKeys) {
    const match = byKey.get(key)!;
    let queryCosine = 0;
    if (queryVec !== null) {
      try {
        // Prefer the input chunk's embedText (same embedding space used during ranking);
        // fall back to the match's display text.
        const inputChunk = inputByKey.get(key);
        const chunkVec = await options.embed(inputChunk?.embedText ?? match.text);
        queryCosine = cosineSimilarity(queryVec, chunkVec);
      } catch {
        // Fail-safe: an appended bridge must NEVER inflate retrieval confidence.
        queryCosine = 0;
      }
    }
    additions.push({ ...match, cosine: queryCosine });
  }

  const deduped = await dropNearDuplicateAdditions(primary, additions, (match) =>
    embedChunkVec(inputByKey.get(keyOf(match)), match, options.embed)
  );
  return [...primary, ...deduped];
}
