import { describe, expect, it } from "vitest";

import { parseHistoryLimit } from "../src/server-input-utils.js";

describe("parseHistoryLimit — strict `?limit=` parse for /api/reminders/history + /api/proactive/history so a malformed value falls back to the store default (undefined) instead of silently honoring a truncated / hex / scientific interpretation (sibling-parity with scheduler-routes' strict limit parse)", () => {
  it("parses a well-formed positive integer", () => {
    expect(parseHistoryLimit("20", 500)).toBe(20);
    expect(parseHistoryLimit("1", 500)).toBe(1);
  });

  it("clamps to the supplied max", () => {
    expect(parseHistoryLimit("999", 500)).toBe(500);
    expect(parseHistoryLimit("500", 500)).toBe(500);
  });

  it("returns undefined (→ store default) when the param is absent", () => {
    expect(parseHistoryLimit(undefined, 500)).toBeUndefined();
  });

  it("strict-rejects a non-integer / hex / scientific / unit-slipped value instead of silently honoring it — these all return undefined, NOT 9 / 16 / 1000 / 30", () => {
    for (const bad of ["9.5", "0x10", "1e3", "30s", "12abc", "1_000", " ", "", "-3", "0", "+5"]) {
      expect(parseHistoryLimit(bad, 500), `"${bad}" must not be silently honored`).toBeUndefined();
    }
  });
});
