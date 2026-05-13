/**
 * Step 4 of `docs/design/pattern-detection.md` — orchestrator that
 * stitches the two detectors together with a cooldown gate.
 *
 * Pure function. Caller resolves the fired-records sidecar from
 * disk (`@muse/mcp`'s `readPatternsFired`), passes them in.
 * Returns the subset of detected patterns that should actually
 * fire *right now*: in-slot (currentSlotOnly), past cooldown, and
 * over the configured confidence floor.
 *
 * The daemon-side wiring (read sidecar → call this → fire through
 * messaging → record patternId via `recordPatternFired`) ships in
 * a follow-on iter; this module keeps the policy logic
 * I/O-free for testability.
 */

import {
  detectTimeOfDayPatterns,
  detectWeeklyTaskPatterns,
  type PatternMatch
} from "./pattern-detector.js";
import type { PatternSignals } from "./pattern-signals.js";

export interface CooldownRecordLike {
  readonly patternId: string;
  readonly firedAtMs: number;
}

export interface SelectFireablePatternsOptions {
  readonly cooldownMs?: number;
  readonly minConfidence?: number;
  /** Cap on returned matches per tick. Default 3. */
  readonly maxPerTick?: number;
  /** Detector knobs. Both flow through to their respective detectors. */
  readonly timeOfDay?: {
    readonly minMatches?: number;
    readonly minDistinctDays?: number;
  };
  readonly weeklyTask?: {
    readonly minMatches?: number;
    readonly minDistinctWeeks?: number;
  };
}

const DEFAULT_COOLDOWN_MS = 24 * 60 * 60_000;
const DEFAULT_MIN_CONFIDENCE = 0.7;
const DEFAULT_MAX_PER_TICK = 3;

/**
 * Combine both detectors with `currentSlotOnly: true`, then drop
 * anything that's on cooldown or below the proactive confidence
 * floor. The output is what the daemon should actually fire on
 * this tick, sorted by confidence desc.
 *
 * Note the confidence floor here (default 0.7) is intentionally
 * stricter than the detectors' raw floor (0.4). A cluster that
 * passes the detector's "is this real?" bar may still be too
 * uncertain to interrupt the user with a proactive suggestion;
 * 0.7 catches the strong patterns only.
 */
export function selectFireablePatterns(
  now: Date,
  signals: PatternSignals,
  fired: readonly CooldownRecordLike[],
  options: SelectFireablePatternsOptions = {}
): readonly PatternMatch[] {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxPerTick = Math.max(1, options.maxPerTick ?? DEFAULT_MAX_PER_TICK);
  const nowMs = now.getTime();

  const timeOfDay = detectTimeOfDayPatterns(now, signals, {
    currentSlotOnly: true,
    ...(options.timeOfDay?.minMatches !== undefined ? { minMatches: options.timeOfDay.minMatches } : {}),
    ...(options.timeOfDay?.minDistinctDays !== undefined ? { minDistinctDays: options.timeOfDay.minDistinctDays } : {})
  });
  const weekly = detectWeeklyTaskPatterns(now, signals, {
    currentSlotOnly: true,
    ...(options.weeklyTask?.minMatches !== undefined ? { minMatches: options.weeklyTask.minMatches } : {}),
    ...(options.weeklyTask?.minDistinctWeeks !== undefined ? { minDistinctWeeks: options.weeklyTask.minDistinctWeeks } : {})
  });

  const all: PatternMatch[] = [...timeOfDay, ...weekly];

  const cooldownByPattern = buildCooldownIndex(fired);

  const fireable = all.filter((match) => {
    if (match.confidence < minConfidence) return false;
    const lastFired = cooldownByPattern.get(match.id);
    if (lastFired !== undefined && nowMs - lastFired < cooldownMs) {
      return false;
    }
    return true;
  });

  fireable.sort((left, right) => right.confidence - left.confidence);

  return fireable.slice(0, maxPerTick);
}

function buildCooldownIndex(fired: readonly CooldownRecordLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const record of fired) {
    const prior = out.get(record.patternId);
    if (prior === undefined || record.firedAtMs > prior) {
      out.set(record.patternId, record.firedAtMs);
    }
  }
  return out;
}
