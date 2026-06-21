import { describe, expect, it } from "vitest";

import { selectRecentlyLearnedFacts, type FactProvenance } from "./belief-provenance-store.js";

const NOW = Date.parse("2026-06-21T00:00:00Z");

const fp = (over: Partial<FactProvenance>): FactProvenance => ({
  key: "home_city",
  kind: "fact",
  value: "Busan",
  firstSeen: "2026-06-20T00:00:00Z",
  lastConfirmed: "2026-06-20T00:00:00Z",
  confirmCount: 1,
  distinctValueCount: 1,
  source: "auto",
  ...over
});

describe("selectRecentlyLearnedFacts", () => {
  it("returns stable facts first learned within the window, newest-first", () => {
    const out = selectRecentlyLearnedFacts(
      [
        fp({ key: "pet", value: "dog", firstSeen: "2026-06-19T00:00:00Z" }),
        fp({ key: "home_city", value: "Busan", firstSeen: "2026-06-20T00:00:00Z" })
      ],
      { now: NOW, withinDays: 30 }
    );
    expect(out.map((f) => f.key)).toEqual(["home_city", "pet"]);
    expect(out[0]).toMatchObject({ key: "home_city", value: "Busan", firstSeen: "2026-06-20T00:00:00Z" });
  });

  it("excludes a CHANGED / flip-flopping key (distinctValueCount > 1) — that is the supersession/volatile signal, not a first-learning", () => {
    expect(selectRecentlyLearnedFacts([fp({ distinctValueCount: 2 })], { now: NOW, withinDays: 30 })).toEqual([]);
  });

  it("excludes a fact first learned OUTSIDE the recency window", () => {
    expect(selectRecentlyLearnedFacts([fp({ firstSeen: "2026-01-01T00:00:00Z" })], { now: NOW, withinDays: 30 })).toEqual([]);
  });

  it("caps the result count", () => {
    const many = Array.from({ length: 8 }, (_, i) => fp({ key: `k${i.toString()}`, firstSeen: `2026-06-${(10 + i).toString()}T00:00:00Z` }));
    expect(selectRecentlyLearnedFacts(many, { now: NOW, withinDays: 30, maxResults: 3 })).toHaveLength(3);
  });
});
