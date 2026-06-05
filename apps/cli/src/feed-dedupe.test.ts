import { describe, expect, it } from "vitest";

import { collapseNearDuplicates, DEFAULT_NEAR_DUPLICATE_RESEMBLANCE, jaccardResemblance, titleShingles } from "./feed-dedupe.js";

describe("titleShingles — word-token shingle set", () => {
  it("lowercases, splits on punctuation, drops stopwords + 1-char tokens", () => {
    expect([...titleShingles("Apple's M5 Chip at WWDC!")].sort()).toEqual(["apple", "chip", "m5", "wwdc"]);
  });

  it("is order-independent (a set)", () => {
    expect(titleShingles("M5 chip Apple")).toEqual(titleShingles("Apple chip M5"));
  });
});

describe("jaccardResemblance — Broder resemblance of two shingle sets", () => {
  it("is 1 for identical content sets and 0 for disjoint", () => {
    expect(jaccardResemblance(titleShingles("Mars rover finds ice"), titleShingles("rover Mars ice finds"))).toBe(1);
    expect(jaccardResemblance(titleShingles("Mars rover finds ice"), titleShingles("Stock market dips today"))).toBe(0);
  });

  it("a near-dup retelling resembles ABOVE the threshold; an unrelated story BELOW it", () => {
    const a = titleShingles("Apple unveils the new M5 chip at WWDC");
    const b = titleShingles("Apple announces a new M5 chip during the WWDC keynote");
    const unrelated = titleShingles("Local bakery wins a national pastry award");
    expect(jaccardResemblance(a, b)).toBeGreaterThanOrEqual(DEFAULT_NEAR_DUPLICATE_RESEMBLANCE);
    expect(jaccardResemblance(a, unrelated)).toBeLessThan(DEFAULT_NEAR_DUPLICATE_RESEMBLANCE);
  });

  it("an empty shingle set resembles nothing", () => {
    expect(jaccardResemblance(titleShingles(""), titleShingles("real headline here"))).toBe(0);
  });
});

describe("collapseNearDuplicates — keep the freshest of each near-dup cluster", () => {
  const items = (...titles: string[]) => titles.map((title, i) => ({ id: i, title }));

  it("drops a later near-duplicate, keeping the earlier (fresher) one + counts the collapse", () => {
    const out = collapseNearDuplicates(
      items(
        "Apple unveils the new M5 chip at WWDC",
        "Apple announces a new M5 chip during the WWDC keynote",
        "Local bakery wins a national pastry award this weekend"
      ),
      (it) => it.title
    );
    expect(out.kept.map((k) => k.id)).toEqual([0, 2]); // the second (a retelling of #0) is dropped
    expect(out.collapsed).toBe(1);
  });

  it("keeps every item when all titles are distinct stories (never merges different news)", () => {
    const out = collapseNearDuplicates(
      items(
        "Infrastructure spending bill clears the Senate",
        "New pasta recipe goes viral on social media",
        "Magnitude 6 earthquake strikes off the coast"
      ),
      (it) => it.title
    );
    expect(out.kept).toHaveLength(3);
    expect(out.collapsed).toBe(0);
  });

  it("a stricter threshold collapses fewer; a permissive one collapses more", () => {
    const titles = items(
      "Apple unveils the new M5 chip at WWDC",
      "Apple announces a new M5 chip during the WWDC keynote"
    );
    expect(collapseNearDuplicates(titles, (it) => it.title, { minResemblance: 1 }).collapsed).toBe(0);
    expect(collapseNearDuplicates(titles, (it) => it.title, { minResemblance: 0.1 }).collapsed).toBe(1);
  });

  it("a blank title is never treated as a duplicate (no signal — always kept)", () => {
    const out = collapseNearDuplicates(items("", "", "real headline"), (it) => it.title);
    expect(out.kept).toHaveLength(3);
    expect(out.collapsed).toBe(0);
  });

  it("preserves input (newest-first) order among the kept items", () => {
    const out = collapseNearDuplicates(
      items(
        "Zebra wildlife census released",
        "Apple unveils the new M5 chip at WWDC",
        "Apple announces a new M5 chip during the WWDC keynote",
        "Yak farming subsidies debated"
      ),
      (it) => it.title
    );
    expect(out.kept.map((k) => k.title)).toEqual([
      "Zebra wildlife census released",
      "Apple unveils the new M5 chip at WWDC",
      "Yak farming subsidies debated"
    ]);
  });
});
