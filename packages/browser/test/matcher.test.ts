import { describe, expect, it } from "vitest";

import type { SnapshotElement } from "../src/controller.js";
import { filterElements, matchElement } from "../src/matcher.js";

const els: SnapshotElement[] = [
  { name: "Sign in", ref: 0, role: "button" },
  { name: "Sign up", ref: 1, role: "link" },
  { name: "Search", ref: 2, role: "textbox" },
  { name: "Add to cart", ref: 3, role: "button" },
  { name: "Home", ref: 4, role: "link" }
];

describe("matchElement — deterministic grounding (model names, code resolves)", () => {
  it("exact name wins", () => {
    expect(matchElement(els, "Sign in", "click")?.ref).toBe(0);
  });

  it("substring: 'the Sign in button' resolves to 'Sign in'", () => {
    expect(matchElement(els, "the Sign in button", "click")?.ref).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(matchElement(els, "ADD TO CART", "click")?.ref).toBe(3);
  });

  it("disambiguates Sign in vs Sign up by the distinctive word", () => {
    expect(matchElement(els, "sign up", "click")?.ref).toBe(1);
  });

  it("role bonus breaks ties toward the acting intent", () => {
    const ambiguous: SnapshotElement[] = [
      { name: "go", ref: 0, role: "link" },
      { name: "go", ref: 1, role: "textbox" }
    ];
    expect(matchElement(ambiguous, "go", "type")?.ref).toBe(1);
    expect(matchElement(ambiguous, "go", "click")?.ref).toBe(0);
  });

  it("returns undefined when nothing matches", () => {
    expect(matchElement(els, "checkout", "click")).toBeUndefined();
    expect(matchElement(els, "   ", "click")).toBeUndefined();
  });
});

describe("filterElements — focused browser_read", () => {
  it("returns only loosely-matching elements", () => {
    expect(filterElements(els, "sign").map((e) => e.ref)).toEqual([0, 1]);
  });

  it("an empty query returns everything", () => {
    expect(filterElements(els, "")).toHaveLength(5);
  });
});
