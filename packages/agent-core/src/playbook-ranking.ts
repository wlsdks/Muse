import { cosineSimilarity } from "./episodic-ranking.js";
import { isInjectableStrategy, isStaleStrategy, rankingUtility } from "./playbook-lifecycle.js";
import { effectiveStrategyReward, type PlaybookStrategy } from "./playbook-model.js";

/**
 * ReasoningBank (arXiv 2509.25140): a self-evolving agent retrieves only the
 * reasoning memory RELEVANT to the current task instead of dumping the whole
 * bank. Here it ranks the playbook's strategies against the current turn and
 * keeps the top-K, so as auto-distillation grows the bank the small local
 * model still sees a tight, on-topic directive block (`tool-calling.md`).
 *
 * Deterministic: token-overlap (CJK-aware, stopword-filtered) between the
 * query and each strategy's text + tag (a tag mention is weighted as a strong
 * signal). No embeddings, no LLM, no new dep — the scorer is the swap-point
 * for an embedding ranker later. When the bank is at or below `topK` the SET
 * is unchanged (today's inject-all), only ordered most-relevant-first.
 */
export interface RankPlaybookOptions {
  /** Max strategies to keep. Default 6 — bounds the injected directive block. */
  readonly topK?: number;
  /** A strategy must exceed this overlap score to qualify on relevance. Default 0. */
  readonly minScore?: number;
}

const DEFAULT_RANK_TOPK = 6;

// Whole-word ASCII function words add noise to overlap scoring (a decoy
// sharing only "the"/"to" would falsely rank). CJK bigrams are not filtered.
const RANK_STOPWORDS = new Set<string>([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "am", "to", "of",
  "in", "on", "for", "and", "or", "my", "your", "our", "what", "who", "how",
  "do", "does", "did", "you", "it", "its", "this", "that", "with", "at", "by",
  "as", "me", "we", "i", "if", "so", "no", "not", "from", "about", "into",
  "than", "please", "the"
]);

// Hangul / Han / Kana are word chars; everything else splits. Mirrors the
// CJK-aware tokenisation episodic-recall uses so Korean strategies match.
const RANK_NON_WORD_RE = /[^a-z0-9가-힯一-鿿぀-ゟ゠-ヿ]+/u;
const RANK_CJK_RE = /[가-힯一-鿿぀-ゟ゠-ヿ]/u;

function rankTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of value.toLowerCase().split(RANK_NON_WORD_RE)) {
    if (raw.length < 2) {
      continue;
    }
    if (RANK_CJK_RE.test(raw)) {
      // CJK has no word spaces; emit char bigrams so a paraphrase still
      // overlaps ("이메일은" shares "이메"/"메일" with "이메일").
      for (let index = 0; index < raw.length - 1; index += 1) {
        tokens.add(raw.slice(index, index + 2));
      }
    } else if (!RANK_STOPWORDS.has(raw)) {
      tokens.add(raw);
    }
  }
  return tokens;
}

function rankOverlap(query: ReadonlySet<string>, tokens: ReadonlySet<string>): number {
  let shared = 0;
  for (const token of tokens) {
    if (query.has(token)) {
      shared += 1;
    }
  }
  return shared;
}

/**
 * Token-overlap (Jaccard) similarity between two strategy texts, CJK-aware via
 * the same tokeniser. Used to dedupe an auto-distilled strategy against the
 * existing bank so repeated corrections don't fill the playbook with
 * paraphrases of one lesson (ReasoningBank, arXiv 2509.25140).
 */
export function strategyTextSimilarity(a: string, b: string): number {
  const ta = rankTokens(a);
  const tb = rankTokens(b);
  if (ta.size === 0 || tb.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of ta) {
    if (tb.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (ta.size + tb.size - intersection);
}

/**
 * Cosine floor for crediting a feedback cue to the strategy it implicates. A
 * strategy TEXT is a terse distilled imperative ("Ask before deleting files");
 * the request CUE is conversational user prose ("hey can you double-check with me
 * first next time?") — DIFFERENT distributions, so lexical Jaccard mis-credits or
 * no-credits a paraphrase / cross-lingual pair. 0.55 mirrors the commitment
 * -discharge cue↔text floor; a genuine implication clears it, an incidental
 * overlap does not.
 */
export const DEFAULT_PLAYBOOK_CREDIT_COSINE = 0.55;

/**
 * HIGHER credit floor for a DECAY (a correction docking a strategy's reward) than
 * for a reinforce. Asymmetric precision (Memory-R2 arXiv:2605.21768 fair credit
 * assignment, applied to the loop's WEDGE): a WRONG decay of a grounded/manual
 * strategy is costlier than a MISSED reinforce — a spuriously-decayed grounded
 * strategy sinks below the avoidance floor and stops being injected, eroding the
 * cited-recall edge, whereas a missed reinforce just leaves reward flat. So a
 * correction must clear a STRONGER cue↔strategy match (0.62) to decay than an
 * approval needs to reinforce (0.55); a borderline correction credits nothing
 * rather than risk decaying the wrong (possibly grounded) strategy.
 */
export const DEFAULT_PLAYBOOK_DECAY_CREDIT_COSINE = 0.62;

/**
 * SEMANTIC credit assignment for the playbook RL loop (fair credit assignment —
 * Memory-R2 arXiv:2605.21768; mis-credited reward replays its error via
 * experience-following — arXiv:2505.16067). Given the existing strategies and a
 * feedback cue, return the id of the strategy the cue most plausibly implicates
 * by embedding cosine (≥ `threshold`), or undefined when nothing clears the floor.
 * Replaces the cross-distribution lexical Jaccard the credit step used (the
 * cumulative lesson: semantic beats lexical on model-prose / paraphrase /
 * multilingual). Fail-soft: an embedder that throws, an empty cue/candidate set,
 * or a zero embedding ⇒ undefined, so the caller falls back to its lexical path
 * (never worse than today). Pure over the injected embedder + exported for
 * direct coverage.
 */
export async function selectCreditTargetSemantic(
  candidates: readonly { readonly id: string; readonly text: string }[],
  cue: string,
  embed: (text: string) => Promise<readonly number[]>,
  threshold: number = DEFAULT_PLAYBOOK_CREDIT_COSINE
): Promise<string | undefined> {
  if (candidates.length === 0 || cue.trim().length === 0) return undefined;
  let cueVec: readonly number[];
  try {
    cueVec = await embed(cue);
  } catch {
    return undefined;
  }
  if (cueVec.length === 0) return undefined;
  let best: { readonly id: string; readonly sim: number } | undefined;
  for (const candidate of candidates) {
    let vec: readonly number[];
    try {
      vec = await embed(candidate.text);
    } catch {
      return undefined;
    }
    if (vec.length === 0) continue;
    const sim = cosineSimilarity(cueVec, vec);
    if (sim >= threshold && (!best || sim > best.sim)) {
      best = { id: candidate.id, sim };
    }
  }
  return best?.id;
}

/**
 * How much one unit of reward shifts the ranking score, as a fraction of a
 * single token-overlap point. Tuned so reward breaks ties and retires a
 * repeatedly-corrected strategy (reward → negative drops it below relevant
 * peers and out of the top-K), without ever overpowering a strong topical
 * match (a 4-token relevance hit still beats a fully-decayed −5 reward).
 */
const REWARD_RANK_WEIGHT = 0.5;

/**
 * Tie-break penalty for a `reflected` (synthetic) strategy. Far smaller
 * than one reward step (0.5) or one relevance point (1), so it ONLY decides a
 * dead heat: a synthetic reflection never outranks an otherwise-equal grounded
 * record, but a genuinely more-relevant/higher-reward strategy still wins.
 */
const REFLECTED_RANK_PENALTY = 0.01;

/**
 * Embedding cosine weight. A semantic match contributes up to this many points
 * — set above the max realistic lexical-overlap so a strategy the user phrased
 * DIFFERENTLY from the current query still surfaces (experience-following:
 * retrieval quality dominates a frozen small model's output), while reward and
 * avoidance still sink a repeatedly-corrected one. Only applied by the
 * embedding ranker; the lexical ranker passes no cosine.
 */
const EMBED_RANK_WEIGHT = 5;


/**
 * MemRL (arXiv:2601.03192): λ=0.5 is the paper's empirical optimum for the
 * value-aware composite score combining z-normalised relevance and utility.
 */
const MEMRL_VALUE_WEIGHT = 0.5;

function relevanceScore(strategy: PlaybookStrategy, query: ReadonlySet<string>, cosine?: number): number {
  const lexical = query.size === 0
    ? 0
    : rankOverlap(query, rankTokens(strategy.text)) + 2 * (strategy.tag ? rankOverlap(query, rankTokens(strategy.tag)) : 0);
  const semantic = typeof cosine === "number" && Number.isFinite(cosine) ? EMBED_RANK_WEIGHT * cosine : 0;
  return lexical + semantic;
}

/** z-score normalise an array; σ=0 contributes 0 for all entries (composite degrades to the other component). */
function zScoreNorm(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) {
    return [];
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sigma = Math.sqrt(variance);
  if (sigma === 0) {
    return values.map(() => 0);
  }
  return values.map((v) => (v - mean) / sigma);
}

function byScoreDescThenIndexAsc(
  a: { readonly score: number; readonly index: number },
  b: { readonly score: number; readonly index: number }
): number {
  return b.score - a.score || a.index - b.index;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * MMR (Maximal Marginal Relevance) diversity-aware final cut — arXiv:2502.09017
 * (Wang et al. 2025, "Diversity Enhances an LLM's Performance in RAG and Long-context Task").
 * Greedy selection: each iteration picks the candidate maximising
 *   λ·normScore − (1−λ)·maxJaccard(candidate, alreadyPicked)
 * where normScore is min-max normalised to [0,1] so λ blends against the [0,1]
 * Jaccard similarity on the same scale.
 * λ=0.7 keeps the cut relevance-dominant: MMR only breaks near-ties, never
 * drops a clearly-more-relevant strategy in favour of a diverse-but-weaker one.
 * Ties (equal MMR value) are broken by original index (lower = earlier insertion).
 * Note: Jaccard is token-overlap so cross-lingual duplicates (KO+EN paraphrase
 * of the same lesson) score ~0 similarity — they are treated as distinct and
 * both can be selected. This is the safe direction (a missed dup = status quo).
 */
const MMR_DIVERSITY_LAMBDA = 0.7;

/**
 * Jaccard threshold above which two strategies are considered same-language paraphrases.
 * High (0.8) so only genuine same-language paraphrases collapse; cross-lingual pairs
 * (KO + EN) score ~0 → never collapsed, safe direction (missed dup = status quo).
 * Extends the shipped MMR diversity principle (arXiv:2502.09017) to the small-bank path;
 * grounded in budget-matched diversity (arXiv:2510.17940, Lin 2025).
 */
export const PLAYBOOK_INJECT_DEDUP_THRESHOLD = 0.8;

type ScoredEntry = { readonly score: number; readonly index: number; readonly strategy: PlaybookStrategy };

/**
 * Greedy near-duplicate suppression over a composite-descending scored list.
 * Admits an entry only if its Jaccard similarity to every already-admitted entry is
 * below `threshold`; otherwise drops the lower-composite duplicate.
 * Pure, order-preserving, never throws. Safe direction: cross-lingual pairs (Jaccard ~0)
 * are always kept — a missed dup is status quo, a dropped distinct strategy is not.
 */
export function suppressNearDuplicateStrategies(
  scored: readonly ScoredEntry[],
  threshold = PLAYBOOK_INJECT_DEDUP_THRESHOLD
): ScoredEntry[] {
  const admitted: ScoredEntry[] = [];
  for (const entry of scored) {
    const isDup = admitted.some(
      (a) => strategyTextSimilarity(entry.strategy.text, a.strategy.text) >= threshold
    );
    if (!isDup) {
      admitted.push(entry);
    }
  }
  return admitted;
}

function mmrSelectStrategies(scored: readonly ScoredEntry[], k: number): ScoredEntry[] {
  if (scored.length === 0 || k <= 0) {
    return [];
  }
  const scores = scored.map((e) => e.score);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores);
  const range = maxS - minS;
  // When all scores are equal, normScore = 1 for all → relevance tied, diversity decides.
  const normScore = (s: number): number => (range === 0 ? 1 : (s - minS) / range);

  const remaining = [...scored];
  const picked: ScoredEntry[] = [];

  while (picked.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestMmr = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const maxSim = picked.length === 0
        ? 0
        : Math.max(...picked.map((p) => strategyTextSimilarity(candidate.strategy.text, p.strategy.text)));
      const mmr = MMR_DIVERSITY_LAMBDA * normScore(candidate.score) - (1 - MMR_DIVERSITY_LAMBDA) * maxSim;
      if (mmr > bestMmr || (mmr === bestMmr && candidate.index < remaining[bestIdx]!.index)) {
        bestMmr = mmr;
        bestIdx = i;
      }
    }
    picked.push(remaining[bestIdx]!);
    remaining.splice(bestIdx, 1);
  }
  return picked;
}

function rankEligible(
  strategies: readonly PlaybookStrategy[],
  options: RankPlaybookOptions | undefined,
  relevanceOf: (strategy: PlaybookStrategy) => number,
  utilityOf: (strategy: PlaybookStrategy) => number,
  nowMs?: number
): readonly PlaybookStrategy[] {
  const topK = Math.max(1, Math.trunc(finiteOr(options?.topK, DEFAULT_RANK_TOPK)));
  const minScore = finiteOr(options?.minScore, 0);
  // Learned avoidance, probation exclusion, and SSGM staleness gate run before ranking.
  const eligible = strategies.filter((s) => isInjectableStrategy(s) && !isStaleStrategy(s, nowMs));
  // Input is oldest→newest insertion order, so `index` doubles as a recency
  // proxy (higher = more recent) for the floor below.
  const withRel = eligible.map((strategy, index) => ({
    index,
    relevance: relevanceOf(strategy),
    strategy
  }));

  if (eligible.length <= topK) {
    // Small-bank path: inject all, ordered by composite (relevance + reward − penalty).
    const scored = withRel.map((e) => ({
      ...e,
      score: e.relevance + REWARD_RANK_WEIGHT * utilityOf(e.strategy)
        - (e.strategy.origin === "reflected" ? REFLECTED_RANK_PENALTY : 0)
    }));
    const sorted = [...scored].sort(byScoreDescThenIndexAsc);
    // Suppress near-duplicate paraphrases; keeps the higher-composite entry (sorted first).
    return suppressNearDuplicateStrategies(sorted).map((s) => s.strategy);
  }

  // MemRL two-phase value-aware retrieval (arXiv:2601.03192):
  // Phase A — relevance gates eligibility. Reward can never lift an off-topic strategy in.
  const k1 = 2 * topK;
  const candidates = withRel
    .filter((e) => e.relevance > minScore)
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .slice(0, k1);

  if (candidates.length === 0) {
    // Recency floor: non-empty bank must never inject zero strategies.
    const recentFirst = withRel.slice().sort((a, b) => b.index - a.index);
    const floor: typeof withRel = [];
    for (const candidate of recentFirst) {
      if (floor.length >= topK) {
        break;
      }
      floor.push(candidate);
    }
    const scored = floor.map((e) => ({
      ...e,
      score: e.relevance + REWARD_RANK_WEIGHT * utilityOf(e.strategy)
        - (e.strategy.origin === "reflected" ? REFLECTED_RANK_PENALTY : 0)
    }));
    return [...scored].sort(byScoreDescThenIndexAsc).map((s) => s.strategy);
  }

  // Phase B — within the candidate pool, z-score normalise relevance and utility,
  // then pick top-K by composite. λ=0.5 per MEMRL_VALUE_WEIGHT.
  const relValues = candidates.map((e) => e.relevance);
  const utilValues = candidates.map((e) => utilityOf(e.strategy));
  const relNorm = zScoreNorm(relValues);
  const utilNorm = zScoreNorm(utilValues);

  const phaseB = candidates.map((e, i) => ({
    ...e,
    score: MEMRL_VALUE_WEIGHT * (relNorm[i] ?? 0) + MEMRL_VALUE_WEIGHT * (utilNorm[i] ?? 0)
      - (e.strategy.origin === "reflected" ? REFLECTED_RANK_PENALTY : 0)
  }));

  const selected = mmrSelectStrategies(phaseB.sort(byScoreDescThenIndexAsc), topK);

  if (selected.length < topK) {
    // Recency floor: top up with most-recent strategies not already selected.
    // Score fillers STRICTLY BELOW every value-aware Phase-B pick (they are floor
    // fillers — they may not even have cleared the Phase-A relevance gate), keeping
    // recency order among themselves. Scoring them on the RAW composite (the
    // unbounded relevance+reward scale) while Phase B scores on the z-normalised
    // scale let a high-utility low-relevance filler outrank a genuine pick once the
    // two scales were sorted together — the rank-fusion scale-mix anti-pattern
    // (MemRL arXiv:2601.03192: the value blend must stay on one scale).
    const minSelectedScore = selected.length > 0
      ? Math.min(...selected.map((s) => s.score))
      : 0;
    const chosen = new Set(selected.map((s) => s.index));
    const recentFirst = withRel
      .filter((e) => !chosen.has(e.index))
      .sort((a, b) => b.index - a.index);
    let fillerRank = 1;
    for (const candidate of recentFirst) {
      if (selected.length >= topK) {
        break;
      }
      selected.push({ ...candidate, score: minSelectedScore - fillerRank });
      fillerRank += 1;
    }
  }

  return [...selected].sort(byScoreDescThenIndexAsc).map((s) => s.strategy);
}

/**
 * Drop strategies whose text is empty/whitespace before ranking — a blank
 * strategy is noise that shouldn't occupy an injected slot.
 */
export function dropEmptyTextStrategies(
  strategies: readonly PlaybookStrategy[]
): readonly PlaybookStrategy[] {
  return strategies.filter((s) => s.text.trim().length > 0);
}

export function rankPlaybookStrategies(
  strategies: readonly PlaybookStrategy[],
  queryText: string,
  options?: RankPlaybookOptions,
  nowMs?: number
): readonly PlaybookStrategy[] {
  const query = rankTokens(queryText);
  const cleaned = dropEmptyTextStrategies(strategies);
  return rankEligible(cleaned, options, (s) => relevanceScore(s, query), (s) => rankingUtility(s, nowMs), nowMs);
}

/**
 * CBR case-density confidence threshold (arXiv:2504.06943): two strategies whose
 * embeddings are at least this similar sit in the same "case region" and
 * corroborate each other. 0.6 = the conservative agreeing-cosine floor (a real
 * neighbor, not an incidental overlap).
 */
export const PLAYBOOK_SUPPORT_DENSITY_COSINE = 0.6;

/**
 * Count how many OTHER strategy vectors sit in the same semantic region as the
 * target (cosine ≥ threshold) — the CBR support density (arXiv:2504.06943): a
 * dense neighborhood signals a corroborated, high-confidence region; zero
 * neighbors a sparse, low-confidence one. Semantic (cosine), not lexical — a
 * paraphrased sibling still corroborates. Fail-soft: empty target → 0.
 */
export function strategySupportDensity(
  targetVec: readonly number[],
  otherVecs: readonly (readonly number[])[],
  threshold = PLAYBOOK_SUPPORT_DENSITY_COSINE
): number {
  if (targetVec.length === 0) return 0;
  let neighbors = 0;
  for (const v of otherVecs) {
    if (v.length > 0 && cosineSimilarity(targetVec, v) >= threshold) neighbors += 1;
  }
  return neighbors;
}

/**
 * CBR sparse-region gate (arXiv:2504.06943): an ISOLATED, UNPROVEN, SYNTHETIC
 * (reflected) strategy is a low-confidence guess — drop it from injection. The
 * gate fires ONLY on `origin:"reflected"` (an inferred case): a grounded/manual
 * correction is the user's RECORDED lesson and is never dropped for being novel
 * (the cited-recall wedge stays intact). "Unproven" = effectiveStrategyReward ≤ 0
 * (never reinforced or net-negative); a reflected strategy that earned positive
 * outcome evidence, or that has any same-region neighbor, is kept.
 */
export function isLowSupportStrategy(strategy: PlaybookStrategy, neighborCount: number): boolean {
  if (strategy.origin !== "reflected") return false;
  if (neighborCount > 0) return false;
  return effectiveStrategyReward(strategy) <= 0;
}

/**
 * Embedding-ranked variant of `rankPlaybookStrategies`: blends cosine(query,
 * strategy) into the score so a strategy the user phrased DIFFERENTLY from the
 * current query still surfaces — lexical token-overlap misses a paraphrase, but
 * meaning doesn't. `embed` is duck-typed (text → vector) so agent-core stays
 * model-agnostic; the caller passes a local embedder. Only eligible
 * (non-avoided, non-probation) strategies are embedded, and any strategy whose
 * embedding fails falls back to its pure-lexical score — so a flaky embedder
 * degrades gracefully rather than dropping a strategy. Same top-K + recency
 * floor + exclusions as the sync ranker.
 */
export async function rankPlaybookStrategiesByRelevance(
  strategies: readonly PlaybookStrategy[],
  queryText: string,
  embed: (text: string) => Promise<readonly number[]>,
  options?: RankPlaybookOptions,
  nowMs?: number
): Promise<readonly PlaybookStrategy[]> {
  const query = rankTokens(queryText);
  let queryVec: readonly number[] | undefined;
  try {
    queryVec = await embed(queryText);
  } catch {
    queryVec = undefined;
  }
  const cosineByText = new Map<string, number>();
  const vecByText = new Map<string, readonly number[]>();
  if (queryVec && queryVec.length > 0) {
    for (const strategy of strategies.filter((s) => isInjectableStrategy(s) && !isStaleStrategy(s, nowMs))) {
      if (cosineByText.has(strategy.text)) {
        continue;
      }
      try {
        const strategyVec = await embed(strategy.text);
        vecByText.set(strategy.text, strategyVec);
        cosineByText.set(strategy.text, cosineSimilarity(queryVec, strategyVec));
      } catch {
        // leave unset → this strategy is scored on lexical overlap + reward only
      }
    }
  }
  // CBR case-density gate (arXiv:2504.06943): drop an isolated, unproven, reflected
  // (synthetic) strategy — a sparse-region low-confidence guess. Never a grounded
  // correction (isLowSupportStrategy guards origin), and never when no embedding was
  // available for it (lexical fallback), and never if it would empty the survivor set.
  let gated = strategies;
  if (vecByText.size > 0) {
    const kept = strategies.filter((s) => {
      const targetVec = vecByText.get(s.text);
      if (!targetVec) return true;
      const others: (readonly number[])[] = [];
      for (const o of strategies) {
        if (o === s) continue;
        const ov = vecByText.get(o.text);
        if (ov) others.push(ov);
      }
      return !isLowSupportStrategy(s, strategySupportDensity(targetVec, others));
    });
    if (kept.length > 0 && kept.length < strategies.length) {
      gated = kept;
    }
  }
  return rankEligible(gated, options, (s) => relevanceScore(s, query, cosineByText.get(s.text)), (s) => rankingUtility(s, nowMs), nowMs);
}
