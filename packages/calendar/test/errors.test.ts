import { describe, expect, it } from "vitest";

import { isRetryableCalendarStatus, parseRetryAfterMs } from "../src/errors.js";

describe("parseRetryAfterMs — Retry-After header (RFC 7231)", () => {
  const NOW = Date.parse("2026-06-03T00:00:00.000Z");

  it("parses delta-seconds into ms", () => {
    expect(parseRetryAfterMs("2", NOW)).toBe(2000);
    expect(parseRetryAfterMs(" 30 ", NOW)).toBe(30_000);
    expect(parseRetryAfterMs("0", NOW)).toBe(0);
  });

  it("parses an HTTP-date into a wait relative to now, clamping a past date to 0", () => {
    expect(parseRetryAfterMs("2026-06-03T00:00:05.000Z", NOW)).toBe(5000);
    expect(parseRetryAfterMs("2026-06-02T23:59:55.000Z", NOW)).toBe(0); // past → 0, never negative
  });

  it("rejects junk / decimal / negative / absent (caller falls back to its own backoff)", () => {
    expect(parseRetryAfterMs(null, NOW)).toBeUndefined();
    expect(parseRetryAfterMs(undefined, NOW)).toBeUndefined();
    expect(parseRetryAfterMs("", NOW)).toBeUndefined();
    expect(parseRetryAfterMs("3.5", NOW)).toBeUndefined(); // decimal is not delta-seconds, no clock component
    expect(parseRetryAfterMs("-5", NOW)).toBeUndefined();
    expect(parseRetryAfterMs("soon", NOW)).toBeUndefined();
  });
});

describe("isRetryableCalendarStatus — only transient statuses retry", () => {
  it("treats 429 and any 5xx as retryable", () => {
    expect(isRetryableCalendarStatus(429)).toBe(true);
    expect(isRetryableCalendarStatus(500)).toBe(true);
    expect(isRetryableCalendarStatus(503)).toBe(true);
  });

  it("treats permanent 4xx + undefined/NaN as non-retryable", () => {
    expect(isRetryableCalendarStatus(400)).toBe(false);
    expect(isRetryableCalendarStatus(401)).toBe(false);
    expect(isRetryableCalendarStatus(404)).toBe(false);
    expect(isRetryableCalendarStatus(undefined)).toBe(false);
    expect(isRetryableCalendarStatus(Number.NaN)).toBe(false);
  });
});
