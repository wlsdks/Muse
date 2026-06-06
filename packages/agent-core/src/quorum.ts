/**
 * Quorum sensing for grounded answers — a 2nd line of defense on the
 * fabrication-zero floor.
 *
 * In a bacterial colony a population only flips a behavioral switch once ENOUGH
 * independent signals cross a threshold (Becker et al., Nature Communications
 * 2022/2023) — a noise-robust distributed vote. Here the "signals" are the
 * independent witness SOURCES that actually support an answer; the verdict
 * distinguishes an UNSUPPORTED claim (no witness → abstain), a SINGLE-witness
 * answer (honest to acknowledge), and a CORROBORATED one (≥ quorum agreeing
 * sources).
 *
 * Deliberately NOT a hard gate that refuses single-source answers: most personal
 * facts live in exactly ONE note (your rent is in lease.md and nowhere else), so
 * requiring a quorum would manufacture false refusals. The verdict only LABELS
 * confidence; the caller decides whether to surface a single-source hedge.
 */

export type QuorumVerdict = "none" | "single" | "corroborated";

/** Default quorum: two independent witnesses corroborate. */
export const DEFAULT_QUORUM = 2;

/**
 * Classify an answer by how many INDEPENDENT witness sources support it.
 * `quorum` is clamped to ≥ 2 (a quorum of one is meaningless) and truncated.
 */
export function quorumVerdict(witnessCount: number, quorum: number = DEFAULT_QUORUM): QuorumVerdict {
  if (!Number.isFinite(witnessCount) || witnessCount <= 0) {
    return "none";
  }
  const need = Math.max(2, Math.trunc(Number.isFinite(quorum) ? quorum : DEFAULT_QUORUM));
  return witnessCount >= need ? "corroborated" : "single";
}

/** Count the distinct supporting sources — the independent witnesses — deduped. */
export function independentWitnessCount(sources: readonly string[]): number {
  return new Set(sources.map((source) => source.trim()).filter((source) => source.length > 0)).size;
}
