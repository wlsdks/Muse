/**
 * Extractive summarization — Luhn ("The Automatic Creation of Literature
 * Abstracts", IBM Journal 2(2):159-165, 1958), the founding method of automatic
 * summarization. Score each sentence by the DENSITY of its significant words: a
 * window where several significant (frequent, non-stopword) words cluster close
 * together carries the document's substance. Return the top-scoring sentences in
 * their ORIGINAL order.
 *
 * It is EXTRACTIVE — the output is the document's OWN verbatim sentences, never
 * reworded — so unlike a model summary it cannot fabricate or drift. That makes
 * it the deterministic, no-model, no-fabrication complement to the abstractive
 * `muse ask --file "summarize this"`, true to Muse's "shows its work" edge.
 */

const SUMMARY_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "can",
  "could", "did", "do", "does", "for", "from", "had", "has", "have", "he", "her",
  "his", "i", "if", "in", "into", "is", "it", "its", "just", "may", "me", "might",
  "my", "no", "not", "of", "on", "or", "our", "out", "over", "she", "should",
  "so", "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "to", "too", "up", "very", "was", "we", "were", "what", "when", "which",
  "while", "who", "will", "with", "would", "you", "your", "about", "after", "also",
  "all", "any", "because", "more", "most", "other", "some", "such", "only", "own",
  "same", "those", "us", "how", "where", "why"
]);

/**
 * Split text into sentences, returning each VERBATIM (never mutated — the output
 * must be quotable). Breaks only on . ! ? followed by whitespace, so a decimal
 * like "3.14" (no space after the dot) is never split. An abbreviation followed
 * by a space ("Dr. Smith") may mis-split, but that is benign: the stray "Dr."
 * fragment scores ~0 and is never chosen.
 */
export function splitSentences(text: string): string[] {
  // Drop markdown heading lines (structure, not prose) so a title with no
  // terminal punctuation doesn't glue onto the first real sentence.
  const prose = text
    .split(/\r?\n/u)
    .filter((line) => !/^\s*#{1,6}\s/u.test(line))
    .join("\n");
  const normalized = prose.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return [];
  return normalized
    .split(/(?<=[.!?])\s+/u)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

/** Lowercased alphanumeric word tokens (length >= 2). */
function words(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

export interface ExtractiveSummaryOptions {
  /** Max sentences to return (default 3). */
  readonly maxSentences?: number;
  /** Max insignificant words allowed between two significant words in one cluster (Luhn's gap, default 4). */
  readonly maxGap?: number;
}

export interface RankedSentence {
  readonly sentence: string;
  /** Position in the original document (0-based), so callers can re-order. */
  readonly index: number;
  readonly score: number;
}

/**
 * The set of "significant" words: non-stopword tokens that recur (frequency >= 2),
 * which carry the document's topic. Short texts where nothing recurs fall back to
 * every content word being significant, so a brief note still summarizes.
 */
function significantWords(allWords: readonly string[]): Set<string> {
  const freq = new Map<string, number>();
  for (const word of allWords) {
    if (SUMMARY_STOPWORDS.has(word)) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  const recurring = new Set<string>();
  for (const [word, count] of freq) if (count >= 2) recurring.add(word);
  if (recurring.size > 0) return recurring;
  return new Set(freq.keys());
}

/** Luhn's sentence score: the densest cluster of significant words. 0 when none. */
export function luhnSentenceScore(sentence: string, significant: ReadonlySet<string>, maxGap: number): number {
  const tokens = words(sentence);
  const sigPositions = tokens.map((token, i) => (significant.has(token) ? i : -1)).filter((i) => i >= 0);
  if (sigPositions.length === 0) return 0;
  let best = 0;
  let clusterStart = 0;
  for (let i = 1; i <= sigPositions.length; i += 1) {
    const gap = i < sigPositions.length ? sigPositions[i]! - sigPositions[i - 1]! - 1 : Number.POSITIVE_INFINITY;
    if (gap > maxGap) {
      const sigCount = i - clusterStart;
      const windowLength = sigPositions[i - 1]! - sigPositions[clusterStart]! + 1;
      const score = (sigCount * sigCount) / windowLength;
      if (score > best) best = score;
      clusterStart = i;
    }
  }
  return best;
}

/**
 * Rank every sentence by its Luhn score (highest first; original order breaks
 * ties). Exported so the summary command and a unit test can inspect the scoring.
 */
export function rankSentencesByLuhn(text: string, options: ExtractiveSummaryOptions = {}): RankedSentence[] {
  const maxGap = typeof options.maxGap === "number" && Number.isFinite(options.maxGap) ? Math.max(1, Math.trunc(options.maxGap)) : 4;
  const sentences = splitSentences(text);
  const significant = significantWords(sentences.flatMap((sentence) => words(sentence)));
  return sentences
    .map((sentence, index) => ({ index, score: luhnSentenceScore(sentence, significant, maxGap), sentence }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));
}

/**
 * The extractive summary: the top `maxSentences` Luhn-scored sentences, returned
 * in their ORIGINAL document order (so the summary reads coherently). Returns []
 * for empty input.
 */
export function summarizeExtractive(text: string, options: ExtractiveSummaryOptions = {}): string[] {
  const maxSentences = typeof options.maxSentences === "number" && Number.isFinite(options.maxSentences)
    ? Math.max(1, Math.trunc(options.maxSentences))
    : 3;
  const ranked = rankSentencesByLuhn(text, options);
  if (ranked.length === 0) return [];
  return ranked
    .slice(0, maxSentences)
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);
}
