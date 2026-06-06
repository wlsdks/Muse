import { describe, expect, it } from "vitest";

import { selectEarnedThemes, type ThemeSignal } from "../src/earned-proactivity.js";

const NOW = Date.UTC(2026, 5, 1);
const daysAgo = (d: number): number => NOW - d * 24 * 60 * 60_000;

describe("selectEarnedThemes — C1 feed-forward persistence gate (earned proactivity)", () => {
  it("fires a theme that PERSISTED across sources, over time, and is still active", () => {
    const earned = selectEarnedThemes(
      [{
        theme: "house move",
        occurrences: [
          { source: "notes/move.md", atMs: daysAgo(6) },
          { source: "calendar", atMs: daysAgo(4) },
          { source: "query", atMs: daysAgo(1) }
        ]
      }],
      { nowMs: NOW }
    );
    expect(earned.map((t) => t.theme)).toEqual(["house move"]);
    expect(earned[0]!.distinctSources).toBe(3);
  });

  it("FILTERS a single fleeting mention (the noise the FFL exists to reject)", () => {
    expect(selectEarnedThemes([{ theme: "random", occurrences: [{ source: "query", atMs: daysAgo(1) }] }], { nowMs: NOW })).toEqual([]);
  });

  it("FILTERS a theme seen many times but in only ONE source (no cross-source corroboration)", () => {
    const oneSource: ThemeSignal = {
      theme: "single-note-topic",
      occurrences: [daysAgo(6), daysAgo(4), daysAgo(2)].map((atMs) => ({ atMs, source: "notes/a.md" }))
    };
    expect(selectEarnedThemes([oneSource], { nowMs: NOW })).toEqual([]);
  });

  it("FILTERS a same-day burst (3 mentions, dwell 0 — not sustained)", () => {
    const burst: ThemeSignal = {
      theme: "burst",
      occurrences: [{ source: "a", atMs: daysAgo(1) }, { source: "b", atMs: daysAgo(1) }, { source: "c", atMs: daysAgo(1) }]
    };
    expect(selectEarnedThemes([burst], { nowMs: NOW })).toEqual([]);
  });

  it("FILTERS a theme that persisted but went quiet (stale, no longer active)", () => {
    const stale: ThemeSignal = {
      theme: "old-project",
      occurrences: [{ source: "a", atMs: daysAgo(60) }, { source: "b", atMs: daysAgo(50) }, { source: "c", atMs: daysAgo(40) }]
    };
    expect(selectEarnedThemes([stale], { nowMs: NOW })).toEqual([]); // last 40d ago > activeWithinDays 14
  });

  it("ranks the most-established (dwell × sources) first and caps the list", () => {
    const big: ThemeSignal = { theme: "big", occurrences: [{ source: "a", atMs: daysAgo(10) }, { source: "b", atMs: daysAgo(5) }, { source: "c", atMs: daysAgo(1) }] };
    const small: ThemeSignal = { theme: "small", occurrences: [{ source: "a", atMs: daysAgo(4) }, { source: "b", atMs: daysAgo(3) }, { source: "a", atMs: daysAgo(1) }] };
    const ranked = selectEarnedThemes([small, big], { nowMs: NOW });
    expect(ranked[0]!.theme).toBe("big");
    expect(selectEarnedThemes([big, small], { nowMs: NOW, maxResults: 1 })).toHaveLength(1);
  });
});
