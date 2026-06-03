/**
 * Note-family absence — the filesystem counterpart to `detectTopicAbsence`
 * (which baselines episode-TOPIC cadence). Where topic-absence notices a
 * conversation theme gone silent, this notices a NOTE FAMILY — a folder of the
 * user's notes they USED to update on a regular cadence — gone quiet for far
 * longer than its own baseline ("you usually add to your project-apollo notes
 * every few days; nothing in three weeks").
 *
 * The cadence sample for a family is the set of its files' modification times:
 * each note (one file) is an update event, so N files ⇒ N timestamps. A family
 * fires only with enough history (`minOccurrences` files), and only when the
 * current silence is BOTH past an absolute floor (`minSilentDays`) AND
 * `staleFactor`× its own MEDIAN gap (robust to one outlier). Pure: no I/O — the
 * caller gathers the file mtimes; this is the deterministic, unit-testable core.
 */

export interface NoteActivityEvent {
  /** The note family — typically the top-level folder under the notes dir. */
  readonly family: string;
  /** The file's modification time (ms since epoch) — one update event. */
  readonly updatedAtMs: number;
}

export interface NoteFamilyAbsence {
  /** The family label (folder name). */
  readonly family: string;
  /** How many notes (files) it carried — the cadence sample size. */
  readonly fileCount: number;
  /** mtime of the most recently-updated note — the silence anchor. */
  readonly lastUpdatedMs: number;
  /** Typical days between updates (the LEARNED baseline, median gap). */
  readonly typicalGapDays: number;
  /** Days since the last update — how long it has been silent. */
  readonly silentDays: number;
}

const NOTE_DAY_MS = 86_400_000;

function medianGap(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function detectNoteFamilyAbsence(
  events: readonly NoteActivityEvent[],
  options: {
    readonly now: Date;
    readonly minOccurrences?: number;
    readonly staleFactor?: number;
    readonly minSilentDays?: number;
    readonly limit?: number;
  }
): readonly NoteFamilyAbsence[] {
  const nowMs = options.now.getTime();
  const minOccurrences = Math.max(3, Math.trunc(options.minOccurrences ?? 3));
  const staleFactor = options.staleFactor && options.staleFactor > 1 ? options.staleFactor : 2.5;
  const minSilentMs = Math.max(0, options.minSilentDays ?? 10) * NOTE_DAY_MS;
  const limit = Math.max(1, Math.trunc(options.limit ?? 5));

  const byFamily = new Map<string, number[]>();
  for (const event of events) {
    const family = event.family.trim();
    if (family.length === 0 || !Number.isFinite(event.updatedAtMs)) continue;
    const list = byFamily.get(family);
    if (list) list.push(event.updatedAtMs);
    else byFamily.set(family, [event.updatedAtMs]);
  }

  const out: NoteFamilyAbsence[] = [];
  for (const [family, times] of byFamily) {
    if (times.length < minOccurrences) continue;
    const sorted = [...times].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push(sorted[i]! - sorted[i - 1]!);
    }
    const typicalMs = medianGap(gaps);
    if (typicalMs <= 0) continue;
    const lastUpdatedMs = sorted[sorted.length - 1]!;
    const silentMs = nowMs - lastUpdatedMs;
    if (silentMs >= minSilentMs && silentMs > staleFactor * typicalMs) {
      out.push({
        family,
        fileCount: times.length,
        lastUpdatedMs,
        silentDays: Math.max(1, Math.round(silentMs / NOTE_DAY_MS)),
        typicalGapDays: Math.max(1, Math.round(typicalMs / NOTE_DAY_MS))
      });
    }
  }
  return out
    .sort((a, b) => b.silentDays / b.typicalGapDays - a.silentDays / a.typicalGapDays || b.silentDays - a.silentDays)
    .slice(0, limit);
}
