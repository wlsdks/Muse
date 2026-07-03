/**
 * Pure age-cutoff filtering (DS-13) — the shared primitive behind every
 * local store's retention pruner. Given entries plus a way to read each
 * one's timestamp, splits them into "kept" (within the window) and
 * "dropped" (older than `ageDays`). No I/O: callers own reading/writing
 * their store's actual on-disk format (JSONL append log, one-file-per-run
 * checkpoint dir, a JSON entries array, …) — this only does the age math,
 * so the cutoff logic has ONE implementation and one set of unit tests
 * instead of four slightly-different reimplementations drifting apart.
 */

export interface PruneByAgeOptions<T> {
  /** Retention window in days; anything older than this is dropped. */
  readonly ageDays: number;
  /** Reference "now" instant (ms since epoch) — pass a fixed value in tests. */
  readonly now: number;
  /** Extract the entry's timestamp (ms since epoch). A non-finite result keeps the entry (fail-safe: never drop what we can't date). */
  readonly timestampOf: (entry: T) => number;
}

export interface PruneByAgeResult<T> {
  readonly kept: readonly T[];
  readonly dropped: readonly T[];
}

export function pruneByAge<T>(entries: readonly T[], options: PruneByAgeOptions<T>): PruneByAgeResult<T> {
  const cutoffMs = ageCutoffMs(options.ageDays, options.now);
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const entry of entries) {
    const ts = options.timestampOf(entry);
    if (Number.isFinite(ts) && ts < cutoffMs) {
      dropped.push(entry);
    } else {
      kept.push(entry);
    }
  }
  return { dropped, kept };
}

/** The cutoff instant (ms) `ageDays` back from `now` — for callers that only need the boundary (e.g. a single-timestamp gate) rather than a full list partition. */
export function ageCutoffMs(ageDays: number, now: number): number {
  return now - Math.max(0, ageDays) * 86_400_000;
}
