import { describe, expect, it } from "vitest";

import { detectTimeOfDayPatterns, detectWeeklyTaskPatterns } from "../src/pattern-detector.js";
import type { NoteMtimeSignal, PatternSignals, TaskSignal } from "../src/pattern-signals.js";

/**
 * test/pattern-detector.test.ts already covers the happy path, sorting,
 * stable ids, and the "clearly below threshold" failure cases. What's
 * missing here: the exact >= boundary (does matches===minMatches actually
 * PASS, not just matches>minMatches), option overrides other than the one
 * `minMatches` override buried in an unrelated weekly test, negative/zero
 * option clamping, and the GLOBAL (not per-bucket) observedWeeks denominator
 * — a real, easy-to-miss subtlety where an unrelated old cluster elsewhere
 * in the signal set can suppress an otherwise-valid recent cluster's
 * confidence. Locking that in with a test protects against an accidental
 * "fix" to per-bucket denominators changing behavior silently.
 */

function makeSignals(noteEdits: readonly NoteMtimeSignal[], tasks: readonly TaskSignal[] = []): PatternSignals {
  return { activityEvents: [], capturedAtMs: Date.parse("2026-05-13T21:00:00Z"), noteEdits, tasks };
}

function localEdit(absPath: string, pathFamily: string, year: number, month: number, day: number, hour: number, minute: number): NoteMtimeSignal {
  return { absPath, mtimeMs: new Date(year, month - 1, day, hour, minute, 0, 0).getTime(), pathFamily };
}

function localTask(id: string, title: string, year: number, month: number, day: number, hour = 9): TaskSignal {
  return { createdAtMs: new Date(year, month - 1, day, hour, 0, 0, 0).getTime(), id, status: "open", title };
}

describe("detectTimeOfDayPatterns — exact >= boundary", () => {
  it("fires when matches===minMatches(3) AND distinctDays===minDistinctDays(2) exactly (inclusive boundary)", () => {
    const signals = makeSignals([
      localEdit("/n/journal/a.md", "journal", 2026, 4, 14, 21, 10), // Tue
      localEdit("/n/journal/b.md", "journal", 2026, 4, 14, 21, 20), // same Tue, 2nd edit
      localEdit("/n/journal/c.md", "journal", 2026, 4, 21, 21, 30)  // next Tue
    ]);
    const matches = detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), signals);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.bucket).toMatchObject({ distinctDays: 2, matches: 3 });
  });

  it("does NOT fire when matches is exactly one below the floor (2 < minMatches 3), even with enough distinct days", () => {
    const signals = makeSignals([
      localEdit("/n/journal/a.md", "journal", 2026, 4, 14, 21, 10),
      localEdit("/n/journal/b.md", "journal", 2026, 4, 21, 21, 20)
    ]);
    expect(detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), signals)).toEqual([]);
  });

  it("honours a caller-supplied minMatches/minDistinctDays override looser than the defaults", () => {
    // A single edit would never clear the DEFAULT floor (3 matches, 2 days).
    const signals = makeSignals([localEdit("/n/journal/a.md", "journal", 2026, 4, 14, 21, 10)]);
    expect(detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), signals)).toEqual([]);
    const loosened = detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), signals, { minDistinctDays: 1, minMatches: 1 });
    expect(loosened).toHaveLength(1);
  });

  it("clamps a zero/negative minMatches or minDistinctDays override to 1, never to 0", () => {
    const signals = makeSignals([localEdit("/n/journal/a.md", "journal", 2026, 4, 14, 21, 10)]);
    const withZero = detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), signals, { minDistinctDays: 0, minMatches: -5 });
    const withOne = detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), signals, { minDistinctDays: 1, minMatches: 1 });
    expect(withZero).toEqual(withOne); // -5/0 behave identically to the floor of 1
    expect(withZero).toHaveLength(1);
  });

  it("honours a custom minConfidence — raising it above what the cluster achieves drops the match", () => {
    const signals = makeSignals([
      localEdit("/n/journal/a.md", "journal", 2026, 4, 14, 21, 10),
      localEdit("/n/journal/b.md", "journal", 2026, 4, 14, 21, 20),
      localEdit("/n/journal/c.md", "journal", 2026, 4, 21, 21, 30)
    ]);
    const now = new Date(2026, 4, 13, 21, 0);
    // distinctDays=2 over an observed span of 1 week → confidence min(1, 2/max(2,1))=1.0
    expect(detectTimeOfDayPatterns(now, signals)).toHaveLength(1);
    expect(detectTimeOfDayPatterns(now, signals, { minConfidence: 1.01 })).toEqual([]); // impossible bar
  });

  it("a GLOBAL (not per-bucket) observedWeeks denominator lets an unrelated old cluster suppress a recent cluster's confidence", () => {
    // Recent, otherwise-valid cluster: 3 edits, 2 distinct Tuesdays, ~1 week apart.
    const recent: NoteMtimeSignal[] = [
      localEdit("/n/journal/a.md", "journal", 2026, 4, 14, 21, 10),
      localEdit("/n/journal/b.md", "journal", 2026, 4, 14, 21, 20),
      localEdit("/n/journal/c.md", "journal", 2026, 4, 21, 21, 30)
    ];
    // In isolation it fires (confidence 1.0, well above the 0.4 floor).
    const isolated = detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), makeSignals(recent));
    expect(isolated).toHaveLength(1);

    // An unrelated, much OLDER cluster (different weekday/band/family) stretches
    // the observation span the module computes ONCE across ALL noteEdits.
    const oldNoise: NoteMtimeSignal[] = [
      localEdit("/n/meetings/x.md", "meetings", 2026, 1, 5, 9, 0),  // Monday, ~15 weeks before the recent cluster
      localEdit("/n/meetings/y.md", "meetings", 2026, 1, 12, 9, 0),
      localEdit("/n/meetings/z.md", "meetings", 2026, 1, 19, 9, 0)
    ];
    const combined = detectTimeOfDayPatterns(new Date(2026, 4, 13, 21, 0), makeSignals([...recent, ...oldNoise]));
    const journalMatch = combined.find((m) => m.bucket.pathFamily === "journal");
    // The recent cluster's OWN distinctDays (2) is unchanged, but the shared
    // global observedWeeks (~15) drags its confidence (2/15) below the 0.4
    // default floor — so it drops out entirely once the old noise is present.
    expect(journalMatch).toBeUndefined();
  });
});

describe("detectWeeklyTaskPatterns — exact >= boundary + option overrides", () => {
  it("fires when matches===minMatches(3) AND distinctWeeks===minDistinctWeeks(2) exactly", () => {
    const signals = makeSignals([], [
      localTask("t1", "Retro", 2026, 5, 4),  // Monday
      localTask("t2", "Retro", 2026, 5, 4),  // same Monday, 2nd task
      localTask("t3", "Retro", 2026, 5, 11)  // next Monday
    ]);
    const matches = detectWeeklyTaskPatterns(new Date(2026, 4, 4, 9, 0), signals);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.bucket).toMatchObject({ distinctWeeks: 2, matches: 3 });
  });

  it("does not fire one match below the floor even with enough distinct weeks", () => {
    const signals = makeSignals([], [
      localTask("t1", "Retro", 2026, 5, 4),
      localTask("t2", "Retro", 2026, 5, 11)
    ]);
    expect(detectWeeklyTaskPatterns(new Date(2026, 4, 4, 9, 0), signals)).toEqual([]);
  });

  it("honours a custom minConfidence override for the weekly detector", () => {
    const signals = makeSignals([], [
      localTask("t1", "Retro", 2026, 5, 4),
      localTask("t2", "Retro", 2026, 5, 4),
      localTask("t3", "Retro", 2026, 5, 11)
    ]);
    const now = new Date(2026, 4, 4, 9, 0);
    expect(detectWeeklyTaskPatterns(now, signals)).toHaveLength(1);
    expect(detectWeeklyTaskPatterns(now, signals, { minConfidence: 1.01 })).toEqual([]);
  });

  it("clamps a zero/negative minDistinctWeeks override to 1", () => {
    const signals = makeSignals([], [localTask("t1", "Retro", 2026, 5, 4)]);
    const withNegative = detectWeeklyTaskPatterns(new Date(2026, 4, 4, 9, 0), signals, { minDistinctWeeks: -3, minMatches: 1 });
    const withOne = detectWeeklyTaskPatterns(new Date(2026, 4, 4, 9, 0), signals, { minDistinctWeeks: 1, minMatches: 1 });
    expect(withNegative).toEqual(withOne);
    expect(withNegative).toHaveLength(1);
  });
});
