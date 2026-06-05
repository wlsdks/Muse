/**
 * Near-duplicate detection for feed headlines — Broder resemblance (Broder, "On
 * the resemblance and containment of documents", SEQUENCES 1997): represent each
 * title as a SET of word-token shingles, and two titles are near-duplicates when
 * their resemblance r(A,B) = |A ∩ B| / |A ∪ B| (the Jaccard coefficient of their
 * shingle sets) clears a threshold. This is the classic web-scale near-dup
 * primitive (AltaVista used it to collapse mirror/syndicated pages); MinHash is
 * its scalable estimator, unneeded here because a feed view holds few items, so
 * the EXACT resemblance is computed. Used to collapse the SAME story carried by
 * several feeds into one. Pure + deterministic — no model — so the "feed titles
 * never reach the model" safety property holds (this only set-compares tokens).
 *
 * Tradeoff (honest): lexical resemblance catches a syndicated or lightly-reworded
 * headline, NOT a synonym-heavy rewrite ("Fed hikes rates" vs "Federal Reserve
 * raises interest") — that needs semantics. The threshold is tuned for PRECISION
 * (never merge two genuinely different stories — that would hide news) over
 * recall, so a missed near-dup is a benign extra row, never a dropped story.
 */

const SHINGLE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "by", "with", "from", "as", "is", "are", "be", "its", "it", "this", "that"
]);

/** Word-token shingle set: lowercased alphanumeric runs of length ≥ 2, common stopwords removed (they dilute the resemblance equally for related and unrelated pairs). */
export function titleShingles(text: string): Set<string> {
  const out = new Set<string>();
  for (const token of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 2 && !SHINGLE_STOPWORDS.has(token)) out.add(token);
  }
  return out;
}

/** Broder resemblance / Jaccard of two shingle sets (0 when either is empty). */
export function jaccardResemblance(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) if (large.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Shingle-set resemblance at/above this is "the same story". Tuned for PRECISION
// on real headline pairs: syndicated/near-verbatim retellings (the dominant feed-
// clutter source) resemble ~0.5–1.0, while two DIFFERENT stories on the same
// topic — the false-merge hazard — peak at ~0.43 ("Magnitude 6 quake strikes
// Japan" vs "Magnitude 5 quake strikes Chile", sharing a headline template). So
// 0.5 sits above that hazard: it never merges distinct stories (which would hide
// news), at the cost of letting a terse or synonym-heavy retelling through as a
// benign extra row.
export const DEFAULT_NEAR_DUPLICATE_RESEMBLANCE = 0.5;

export interface CollapseResult<T> {
  /** Items with later near-duplicates removed (input order preserved). */
  readonly kept: readonly T[];
  /** How many items were dropped as near-duplicates of an earlier kept item. */
  readonly collapsed: number;
}

/**
 * Greedy near-duplicate collapse: walk `items` in the given order (callers pass
 * newest-first, so the FRESHEST of each near-dup cluster survives) and keep an
 * item only when its title's resemblance to every already-kept title is below
 * `minResemblance`. A blank title carries no signal, so it is always kept.
 */
export function collapseNearDuplicates<T>(
  items: readonly T[],
  titleOf: (item: T) => string,
  options: { readonly minResemblance?: number } = {}
): CollapseResult<T> {
  const minResemblance = typeof options.minResemblance === "number" && Number.isFinite(options.minResemblance)
    ? Math.min(1, Math.max(0, options.minResemblance))
    : DEFAULT_NEAR_DUPLICATE_RESEMBLANCE;
  const kept: T[] = [];
  const keptShingles: Set<string>[] = [];
  let collapsed = 0;
  for (const item of items) {
    const title = titleOf(item).trim();
    if (title.length === 0) {
      kept.push(item);
      continue;
    }
    const shingles = titleShingles(title);
    if (keptShingles.some((seen) => jaccardResemblance(seen, shingles) >= minResemblance)) {
      collapsed += 1;
      continue;
    }
    kept.push(item);
    keptShingles.push(shingles);
  }
  return { collapsed, kept };
}
