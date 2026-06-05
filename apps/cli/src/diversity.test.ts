import { describe, expect, it } from "vitest";

import { categoryCounts, diversityOf, formatDiversity } from "./diversity.js";

const counts = (...pairs: [string, number][]) => new Map(pairs);

describe("categoryCounts", () => {
  it("counts distinct trimmed values, dropping blanks", () => {
    expect([...categoryCounts(["food", "rent", " food ", "", "rent"]).entries()].sort()).toEqual([["food", 2], ["rent", 2]]);
  });
});

describe("diversityOf — Shannon / Simpson / evenness", () => {
  it("a perfectly even distribution maximizes Shannon (= ln S) and evenness (= 1)", () => {
    const r = diversityOf(counts(["a", 10], ["b", 10], ["c", 10], ["d", 10]));
    expect(r.richness).toBe(4);
    expect(r.shannon).toBeCloseTo(Math.log(4), 6);
    expect(r.evenness).toBeCloseTo(1, 6);
    expect(r.simpson).toBeCloseTo(0.75, 6); // 1 - 4*(0.25^2)
  });

  it("a single category has zero Shannon, zero Simpson, evenness 1 by convention", () => {
    const r = diversityOf(counts(["only", 50]));
    expect(r.shannon).toBe(0);
    expect(r.simpson).toBe(0);
    expect(r.evenness).toBe(1);
    expect(r.dominant).toEqual({ category: "only", share: 1 });
  });

  it("a dominated distribution has low evenness and names the dominant category", () => {
    const r = diversityOf(counts(["rent", 90], ["food", 5], ["fun", 5]));
    expect(r.dominant?.category).toBe("rent");
    expect(r.dominant?.share).toBeCloseTo(0.9, 6);
    expect(r.evenness).toBeLessThan(0.5); // highly concentrated
    expect(r.simpson).toBeLessThan(0.2);
  });

  it("an empty map is all-zero", () => {
    expect(diversityOf(new Map())).toEqual({ evenness: 0, richness: 0, shannon: 0, simpson: 0, total: 0 });
  });
});

describe("formatDiversity", () => {
  it("flags a highly-concentrated column", () => {
    const out = formatDiversity(diversityOf(counts(["rent", 90], ["food", 10])), "category");
    expect(out).toContain("Diversity — column 'category'");
    expect(out).toContain("Highly concentrated");
    expect(out).toContain("rent");
  });

  it("praises a well-balanced column", () => {
    const out = formatDiversity(diversityOf(counts(["a", 10], ["b", 10], ["c", 10])), "category");
    expect(out).toContain("Well balanced");
  });
});
