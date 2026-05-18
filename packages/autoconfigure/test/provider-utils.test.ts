import { describe, expect, it } from "vitest";

import { clampPositive } from "../src/provider-utils.js";

describe("clampPositive (env-numeric context-window guard)", () => {
  it("returns the fallback when the env var is unset", () => {
    expect(clampPositive(undefined, 20)).toBe(20);
  });

  it("returns a valid positive integer (whitespace-trimmed)", () => {
    expect(clampPositive("12", 20)).toBe(12);
    expect(clampPositive("  7  ", 20)).toBe(7);
  });

  it("falls back for non-positive values", () => {
    expect(clampPositive("0", 20)).toBe(20);
    expect(clampPositive("-5", 20)).toBe(20);
  });

  it("falls back for non-numeric / empty / whitespace (env misconfig)", () => {
    expect(clampPositive("abc", 20)).toBe(20);
    expect(clampPositive("", 20)).toBe(20);
    expect(clampPositive("   ", 20)).toBe(20);
  });

  it("uses base-10 parseInt semantics (pins behaviour vs a future Number() refactor)", () => {
    expect(clampPositive("12.9", 20)).toBe(12);   // truncated, not 13
    expect(clampPositive("12abc", 20)).toBe(12);  // lenient prefix parse
    expect(clampPositive("1e3", 20)).toBe(1);     // NOT 1000 (parseInt stops at 'e')
    expect(clampPositive("0x10", 20)).toBe(20);   // base-10 → "0" → ≤0 → fallback, NOT 16
  });
});
