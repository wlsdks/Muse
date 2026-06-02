import { describe, expect, it } from "vitest";

import { resolveRelativeTimePhrase } from "../src/loopback-relative-time.js";

// Reference: Wednesday 2026-06-03 09:30 UTC. Assertions are timezone-robust
// (day counts / local getHours / KO-equals-EN), never a hard-coded ISO.
const now = (): Date => new Date("2026-06-03T09:30:00Z");

describe("resolveRelativeTimePhrase — period phrases (next week/month/year + KO parity)", () => {
  it("resolves next week / month / year (EN) to future dates", () => {
    for (const phrase of ["next week", "next month", "next year"]) {
      const resolved = resolveRelativeTimePhrase(phrase, now);
      expect(resolved, phrase).toBeDefined();
      expect(resolved!.getTime(), phrase).toBeGreaterThan(now().getTime());
    }
  });

  it("'next week' lands about 7 days out", () => {
    const days = (resolveRelativeTimePhrase("next week", now)!.getTime() - now().getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThan(8);
  });

  it("'next year' lands about a year out", () => {
    const days = (resolveRelativeTimePhrase("next year", now)!.getTime() - now().getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });

  it("KO 다음 주 / 다음 달 / 내년 match their English counterparts exactly", () => {
    expect(resolveRelativeTimePhrase("다음 주", now)?.toISOString()).toBe(resolveRelativeTimePhrase("next week", now)?.toISOString());
    expect(resolveRelativeTimePhrase("다음 달", now)?.toISOString()).toBe(resolveRelativeTimePhrase("next month", now)?.toISOString());
    expect(resolveRelativeTimePhrase("내년", now)?.toISOString()).toBe(resolveRelativeTimePhrase("next year", now)?.toISOString());
  });

  it("'next month at 2pm' parses the time of day", () => {
    expect(resolveRelativeTimePhrase("next month at 2pm", now)!.getHours()).toBe(14);
  });

  it("does NOT break weekday 'next monday' (still resolves to a Monday)", () => {
    expect(resolveRelativeTimePhrase("next monday", now)!.getDay()).toBe(1);
  });

  it("does NOT match a non-period 'next <noun>' — precision over a bare weekday slot", () => {
    expect(resolveRelativeTimePhrase("next mango", now)).toBeUndefined();
    expect(resolveRelativeTimePhrase("next thing", now)).toBeUndefined();
  });
});
