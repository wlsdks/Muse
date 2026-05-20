import { describe, expect, it } from "vitest";

import { parseChatRateLimitCapacity } from "../src/server-routes.js";

describe("parseChatRateLimitCapacity — strict-parses MUSE_RATE_LIMIT_CHAT_PER_MINUTE", () => {
  it("returns the fallback when the env value is undefined or non-string", () => {
    expect(parseChatRateLimitCapacity(undefined)).toBe(60);
  });

  it("accepts a clean positive integer (trimmed)", () => {
    expect(parseChatRateLimitCapacity("30")).toBe(30);
    expect(parseChatRateLimitCapacity(" 120 ")).toBe(120);
  });

  it("rejects a lenient-prefix typo / unit-slip / decimal / scientific so the rate limit can't be silently mis-sized", () => {
    for (const bad of ["60x", "30s", "1e3", "5.9", "12abc", "1_000", "-3", "0", " ", "NaN", "Infinity", ""]) {
      expect(parseChatRateLimitCapacity(bad), `"${bad}" must fall through to fallback`).toBe(60);
    }
  });

  it("honours an explicit fallback when no env value parses", () => {
    expect(parseChatRateLimitCapacity(undefined, 120)).toBe(120);
    expect(parseChatRateLimitCapacity("bogus", 120)).toBe(120);
    expect(parseChatRateLimitCapacity("0", 120)).toBe(120);
    expect(parseChatRateLimitCapacity("-7", 120)).toBe(120);
  });
});
