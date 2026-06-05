/**
 * Diversity indices — Shannon (Shannon, "A Mathematical Theory of Communication",
 * Bell System Technical Journal 27, 1948) and Simpson (Simpson, "Measurement of
 * Diversity", Nature 163:688, 1949), the two measures ECOLOGISTS use to quantify
 * biodiversity: how evenly is a population spread across categories, vs dominated
 * by one? Applied to a categorical column of YOUR data, they answer "is my
 * spending / time / effort DIVERSE, or concentrated in one bucket?" — distinct
 * from a count (`muse csv --group-by`), which shows the buckets but not their
 * evenness. Deterministic, no model.
 *
 *   Shannon H' = -Σ p_i ln(p_i)            (0 when one category; ln(S) when even)
 *   Gini-Simpson D = 1 - Σ p_i²            (prob. two random picks differ; 0..1)
 *   Pielou evenness J' = H' / ln(S)        (1 = perfectly even, →0 = dominated)
 */

export interface DiversityResult {
  /** Total observations counted. */
  readonly total: number;
  /** Number of distinct categories (richness, S). */
  readonly richness: number;
  /** Shannon index H' (natural log). */
  readonly shannon: number;
  /** Gini-Simpson index 1 - Σp² (probability two random picks are different categories). */
  readonly simpson: number;
  /** Pielou evenness H'/ln(S) in [0,1]; 1 when a single category, by convention. */
  readonly evenness: number;
  /** The most abundant category and its share, or undefined when empty. */
  readonly dominant?: { readonly category: string; readonly share: number };
}

/** Count occurrences of each distinct (trimmed, non-empty) category value. */
export function categoryCounts(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw.trim();
    if (v.length === 0) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

/** Compute the diversity indices over a category-count map. */
export function diversityOf(counts: ReadonlyMap<string, number>): DiversityResult {
  let total = 0;
  for (const c of counts.values()) total += c;
  if (total === 0) {
    return { evenness: 0, richness: 0, shannon: 0, simpson: 0, total: 0 };
  }
  let shannon = 0;
  let sumP2 = 0;
  let dominant: { category: string; share: number } | undefined;
  for (const [category, count] of counts) {
    const p = count / total;
    if (p > 0) shannon -= p * Math.log(p);
    sumP2 += p * p;
    if (dominant === undefined || p > dominant.share) dominant = { category, share: p };
  }
  const richness = counts.size;
  // Pielou evenness: H'/ln(S). With a single category ln(S)=0 → define J'=1
  // (a lone category is, trivially, perfectly "even").
  const evenness = richness <= 1 ? 1 : shannon / Math.log(richness);
  return { dominant, evenness, richness, shannon, simpson: 1 - sumP2, total };
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** Render the human-readable diversity report for a column. */
export function formatDiversity(result: DiversityResult, column: string): string {
  if (result.total === 0) {
    return `No values found in column '${column}' to measure.\n`;
  }
  const lines = [
    `🌿 Diversity — column '${column}' (${result.total.toString()} values across ${result.richness.toString()} categor${result.richness === 1 ? "y" : "ies"})`,
    `  Shannon H': ${result.shannon.toFixed(3)}  (max ${Math.log(Math.max(1, result.richness)).toFixed(3)} if perfectly even)`,
    `  Gini-Simpson: ${result.simpson.toFixed(3)}  (1 = very diverse, 0 = all one)`,
    `  Evenness J': ${result.evenness.toFixed(3)}  (1 = balanced, →0 = dominated)`
  ];
  if (result.dominant) {
    lines.push(`  Most abundant: '${result.dominant.category}' (${pct(result.dominant.share)})`);
  }
  // Pielou's J' bands are the conventional read of "even vs concentrated".
  if (result.richness <= 1) {
    lines.push("  → Everything is one category — no diversity.");
  } else if (result.evenness >= 0.8) {
    lines.push("  ✓ Well balanced across categories — high diversity.");
  } else if (result.evenness >= 0.5) {
    lines.push("  Moderately concentrated — some categories dominate.");
  } else {
    lines.push(`  ⚠ Highly concentrated — '${result.dominant?.category ?? "one category"}' dominates; little diversity.`);
  }
  return `${lines.join("\n")}\n`;
}
