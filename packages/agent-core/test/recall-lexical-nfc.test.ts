import { describe, expect, it } from "vitest";

import { lexicalTokens, normalizeForRecall } from "../src/index.js";

describe("recall lexical NFC normalization (KO Hangul NFD↔NFC consistency)", () => {
  it("normalizeForRecall composes NFD Hangul to NFC (the canonical form a query uses)", () => {
    const nfd = "한국어".normalize("NFD"); // macOS-style decomposed (jamo)
    expect([...nfd].length).toBeGreaterThan([..."한국어"].length); // genuinely decomposed
    expect(normalizeForRecall(nfd)).toBe("한국어".normalize("NFC"));
  });
  it("a KO note stored NFD and an NFC query produce IDENTICAL tokens (the recall miss is gone)", () => {
    const phrase = "한국어 메모 와이파이 비밀번호";
    const fromNfd = [...lexicalTokens(phrase.normalize("NFD"))];
    const fromNfc = [...lexicalTokens(phrase.normalize("NFC"))];
    expect(fromNfd).toEqual(fromNfc);
    // and an NFC query token set actually intersects an NFD-indexed note's tokens
    expect(fromNfd.every((t) => fromNfc.includes(t))).toBe(true);
    expect(fromNfd.length).toBeGreaterThan(0);
  });
  it("ASCII/EN tokens are unaffected (no behavior change for non-decomposable text)", () => {
    expect([...lexicalTokens("wifi password staging")]).toEqual(["wifi", "password", "staging"]);
  });
});
