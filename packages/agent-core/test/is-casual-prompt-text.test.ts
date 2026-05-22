import { describe, expect, it } from "vitest";

import { isCasualPromptText } from "../src/response-filters-verified-sources.js";

describe("isCasualPromptText — Hangul greetings (the `\\b` after a Korean char never matched)", () => {
  it("detects bare / punctuated / spaced Korean greetings as casual", () => {
    for (const s of ["안녕", "안녕!", "안녕 뭐해", "네", "넵", "응", "좋아", "하이", "고마워"]) {
      expect(isCasualPromptText(s), `${s} should be casual`).toBe(true);
    }
  });

  it("does NOT false-positive on a longer word that merely starts with a greeting", () => {
    // "네이버" (Naver) starts with "네" but is a real query, not a greeting.
    expect(isCasualPromptText("네이버 검색해줘")).toBe(false);
  });

  it("keeps the English greetings working (whole-token, not a prefix of a longer word)", () => {
    expect(isCasualPromptText("thanks")).toBe(true);
    expect(isCasualPromptText("thank you for the help")).toBe(true);
    expect(isCasualPromptText("thanksgiving plans")).toBe(false);
  });

  it("still matches the unanchored Korean gratitude substrings + empty prompt", () => {
    expect(isCasualPromptText("민혁님한테 감사하다고 전해줘")).toBe(true);
    expect(isCasualPromptText("   ")).toBe(true);
  });
});
