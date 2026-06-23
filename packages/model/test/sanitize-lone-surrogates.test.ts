import { describe, expect, it } from "vitest";

import { recoverToolArgsJson, sanitizeLoneSurrogates } from "../src/index.js";

const FFFD = "\uFFFD";

describe("sanitizeLoneSurrogates", () => {
  it("replaces a lone HIGH surrogate with U+FFFD", () => {
    expect(sanitizeLoneSurrogates("caf\uD83D")).toBe(`caf${FFFD}`);
  });

  it("replaces a lone LOW surrogate with U+FFFD", () => {
    expect(sanitizeLoneSurrogates("\uDE00x")).toBe(`${FFFD}x`);
    // a high followed by a non-low char → the high is lone
    expect(sanitizeLoneSurrogates("a\uD83Db")).toBe(`a${FFFD}b`);
  });

  it("leaves a valid surrogate PAIR (a real emoji) untouched", () => {
    const emoji = "hi 😀!"; // 😀
    expect(sanitizeLoneSurrogates(emoji)).toBe(emoji);
  });

  it("is byte-identical (same value) when there is no surrogate at all", () => {
    const plain = "hello, 안녕, 123";
    expect(sanitizeLoneSurrogates(plain)).toBe(plain);
  });

  it("handles multiple lone surrogates and mixed valid pairs in one string", () => {
    expect(sanitizeLoneSurrogates("\uD83Da😀b\uDC00")).toBe(`${FFFD}a😀b${FFFD}`);
  });
});

describe("recoverToolArgsJson deep-sanitizes lone surrogates", () => {
  it("scrubs a lone surrogate in a recovered tool-arg VALUE", () => {
    expect(recoverToolArgsJson('{"city":"se\uD83Doul"}')).toEqual({ city: `se${FFFD}oul` });
  });

  it("scrubs a lone surrogate in a nested value and a key", () => {
    const out = recoverToolArgsJson('{"a\uDC00":{"q":["x\uD83D"]}}');
    expect(out).toEqual({ [`a${FFFD}`]: { q: [`x${FFFD}`] } });
  });

  it("leaves clean args untouched", () => {
    expect(recoverToolArgsJson('{"city":"Seoul","n":2}')).toEqual({ city: "Seoul", n: 2 });
  });
});
