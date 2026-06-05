import { describe, expect, it } from "vitest";

import { formatTrend, mannKendall, MIN_TREND_SAMPLE, sensSlope } from "./trend.js";

describe("sensSlope — median pairwise slope", () => {
  it("is the constant step for a perfectly linear series", () => {
    expect(sensSlope([0, 2, 4, 6, 8])).toBe(2);
    expect(sensSlope([10, 7, 4, 1])).toBe(-3);
  });

  it("is undefined for a single point", () => {
    expect(sensSlope([5])).toBeUndefined();
  });
});

describe("mannKendall — monotonic trend detection", () => {
  it("flags a strong INCREASING trend on a monotonic rising series", () => {
    const r = mannKendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.direction).toBe("increasing");
    expect(r.significance).toBe("strong");
    expect(r.s).toBeGreaterThan(0);
    expect(r.sensSlope).toBe(1);
  });

  it("flags a DECREASING trend on a falling series", () => {
    const r = mannKendall([20, 18, 16, 15, 13, 11, 9, 8, 6, 4]);
    expect(r.direction).toBe("decreasing");
    expect(r.s).toBeLessThan(0);
    expect(["significant", "strong"]).toContain(r.significance);
  });

  it("finds NO trend in a non-monotonic (wandering) series", () => {
    const r = mannKendall([5, 7, 4, 8, 5, 9, 4, 7, 5, 6]);
    expect(r.direction).toBe("none");
    expect(r.significance).toBe("not-significant");
  });

  it("reports insufficient below the sample floor", () => {
    const r = mannKendall([1, 2, 3, 4]);
    expect(r.n).toBe(4);
    expect(r.significance).toBe("insufficient");
    expect(r.direction).toBe("none");
    expect(r.n).toBeLessThan(MIN_TREND_SAMPLE);
  });

  it("handles ties (the variance tie-correction) without crashing, no false trend on all-equal", () => {
    const r = mannKendall([5, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(r.s).toBe(0);
    expect(r.direction).toBe("none");
  });
});

describe("formatTrend", () => {
  it("renders an increasing verdict with z and Sen's slope", () => {
    const out = formatTrend(mannKendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), "weight");
    expect(out).toContain("Trend — column 'weight'");
    expect(out).toContain("INCREASING");
    expect(out).toContain("Sen's slope: 1.0000");
  });

  it("renders the insufficient note for a tiny series", () => {
    expect(formatTrend(mannKendall([1, 2, 3]), "x")).toContain("unreliable");
  });
});
