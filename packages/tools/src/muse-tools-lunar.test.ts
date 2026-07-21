import { describe, expect, it } from "vitest";

import { createLunarDateTool, createLunarToSolarTool, lunarToSolar, solarToLunar } from "./muse-tools-lunar.js";

describe("solarToLunar (Korean dangi calendar via ICU)", () => {
  it("converts 설날 2026-02-17 to lunar 1/1", () => {
    expect(solarToLunar(new Date("2026-02-17T00:00:00Z"))).toEqual({ year: 2026, month: 1, day: 1, leap: false });
  });

  it("converts 추석 2026-09-25 to lunar 8/15", () => {
    expect(solarToLunar(new Date("2026-09-25T00:00:00Z"))).toEqual({ year: 2026, month: 8, day: 15, leap: false });
  });

  it("flags a leap month — 2025-07-25 is 윤6월 1일", () => {
    expect(solarToLunar(new Date("2025-07-25T00:00:00Z"))).toMatchObject({ month: 6, day: 1, leap: true });
  });

  it("uses the Korea timezone for the day boundary (2026-02-16 23:00 KST is still 음 12/29)", () => {
    expect(solarToLunar(new Date("2026-02-16T14:00:00Z"))).toMatchObject({ year: 2025, month: 12, day: 29, leap: false });
  });
});

describe("createLunarDateTool", () => {
  const NOW = () => new Date("2026-06-19T03:00:00Z"); // a solar date that is 음 5/5 (단오)

  it("is a read tool named lunar_date returning today's lunar date by default", () => {
    const tool = createLunarDateTool(NOW);
    expect(tool.definition.name).toBe("lunar_date");
    expect(tool.definition.risk).toBe("read");
    const out = tool.execute({}, { runId: "t", userId: "u" }) as { lunarMonth: number; lunarDay: number; lunar: string };
    expect(out.lunarMonth).toBe(5);
    expect(out.lunarDay).toBe(5);
    expect(out.lunar).toContain("음력");
  });

  it("converts an explicit solar date (설날)", () => {
    const tool = createLunarDateTool(NOW);
    const out = tool.execute({ date: "2026-02-17" }, { runId: "t", userId: "u" }) as { lunarMonth: number; lunarDay: number; isLeapMonth: boolean };
    expect(out).toMatchObject({ lunarMonth: 1, lunarDay: 1, isLeapMonth: false });
  });

  it("labels a leap month in the Korean string", () => {
    const tool = createLunarDateTool(NOW);
    const out = tool.execute({ date: "2025-07-25" }, { runId: "t", userId: "u" }) as { isLeapMonth: boolean; lunar: string };
    expect(out.isLeapMonth).toBe(true);
    expect(out.lunar).toContain("윤6월");
  });

  it("returns an error (never throws) for an invalid date", () => {
    const tool = createLunarDateTool(NOW);
    const out = tool.execute({ date: "not-a-date" }, { runId: "t", userId: "u" }) as { error?: string };
    expect(out.error).toBeTruthy();
  });

  it("errors on a non-string date instead of silently defaulting to today", () => {
    // A number-typed `date` (e.g. 20260925) was previously discarded — `raw`
    // fell back to "" and the tool quietly returned TODAY's lunar date,
    // byte-identical to the no-argument call, as if it had answered the
    // supplied date.
    const tool = createLunarDateTool(NOW);
    const out = tool.execute({ date: 20260925 }, { runId: "t", userId: "u" }) as { error?: string };
    expect(out.error).toContain("ISO-8601");
    expect(out.error).toContain("2026-09-25");
  });

  it("echoes the solar date in the SAME zone (Asia/Seoul) the lunar answer was computed in", () => {
    // A date-only ISO string parses as UTC midnight; Seoul is UTC+9, so the
    // Seoul calendar day is already one ahead for the first 9 hours of the
    // UTC day. `date.toISOString().slice(0,10)` echoed the UTC day, which
    // could read one day BEHIND the lunar fields computed for the Seoul day.
    const tool = createLunarDateTool(NOW);
    const out = tool.execute({ date: "2026-09-25" }, { runId: "t", userId: "u" }) as { solar: string; lunarMonth: number; lunarDay: number };
    expect(out.solar).toBe("2026-09-25");
    expect(out).toMatchObject({ lunarMonth: 8, lunarDay: 15 }); // 추석
  });
});

describe("lunarToSolar (Korean lunar → solar, ICU search)", () => {
  it("finds 음력 2026 1/1 = 설날 2026-02-17", () => {
    expect(lunarToSolar(2026, 1, 1, false)).toBe("2026-02-17");
  });

  it("finds 음력 2026 5/5 = 단오 2026-06-19", () => {
    expect(lunarToSolar(2026, 5, 5, false)).toBe("2026-06-19");
  });

  it("finds a leap month — 윤6월 2025 1일 = 2025-07-25", () => {
    expect(lunarToSolar(2025, 6, 1, true)).toBe("2025-07-25");
  });

  it("returns undefined for a non-existent lunar date (음력 2/30)", () => {
    expect(lunarToSolar(2026, 2, 30, false)).toBeUndefined();
  });

  it("finds a late month-12 date that the search must reach past the next solar new year (음력 2026 12/30 = 2027-02-06)", () => {
    expect(lunarToSolar(2026, 12, 30, false)).toBe("2027-02-06");
  });
});

describe("createLunarToSolarTool", () => {
  const NOW = () => new Date("2026-03-01T00:00:00Z"); // a 2026 solar instant (after 설날)

  it("is a read tool named lunar_to_solar converting a lunar date to solar", () => {
    const tool = createLunarToSolarTool(NOW);
    expect(tool.definition.name).toBe("lunar_to_solar");
    expect(tool.definition.risk).toBe("read");
    const out = tool.execute({ day: 5, month: 5, year: 2026 }, { runId: "t", userId: "u" }) as { solar: string };
    expect(out.solar).toBe("2026-06-19");
  });

  it("defaults the lunar year to the current solar year (a lunar birthday THIS year)", () => {
    const tool = createLunarToSolarTool(NOW);
    const out = tool.execute({ day: 1, month: 1 }, { runId: "t", userId: "u" }) as { solar: string };
    expect(out.solar).toBe("2026-02-17"); // 설날 2026
  });

  it("returns an error for a non-existent lunar date", () => {
    const tool = createLunarToSolarTool(NOW);
    const out = tool.execute({ day: 30, month: 2, year: 2026 }, { runId: "t", userId: "u" }) as { error?: string };
    expect(out.error).toBeTruthy();
  });

  it("errors on a string `leap` instead of silently coercing it to false", () => {
    // `leap: "true"` (a JSON string, not boolean) failed `=== true` and was
    // silently treated as false — a date one lunar month off, returned as
    // a confident answer with no sign the request had been changed.
    const tool = createLunarToSolarTool(NOW);
    const out = tool.execute({ day: 1, leap: "true", month: 6 }, { runId: "t", userId: "u" }) as { error?: string };
    expect(out.error).toContain("leap");
    expect(out.error).toContain("boolean");
  });

  it("errors on a string `year` instead of silently defaulting to the current year", () => {
    const tool = createLunarToSolarTool(NOW);
    const out = tool.execute({ day: 5, month: 5, year: "2030" }, { runId: "t", userId: "u" }) as { error?: string };
    expect(out.error).toContain("year");
    expect(out.error).toContain("number");
  });

  it("distinguishes a wrong-TYPE month/day from an out-of-RANGE one", () => {
    // month: "8" is a valid value once it's a number — the type is the
    // problem, not the range. Reporting "must be 1-12" sends the model
    // retrying values inside 1-12 forever.
    const tool = createLunarToSolarTool(NOW);
    const typeError = tool.execute({ day: 5, month: "8", year: 2026 }, { runId: "t", userId: "u" }) as { error?: string };
    expect(typeError.error).toContain("number");
    expect(typeError.error).not.toContain("1–12");
    const dayTypeError = tool.execute({ day: "5", month: 8, year: 2026 }, { runId: "t", userId: "u" }) as { error?: string };
    expect(dayTypeError.error).toContain("number");
    const rangeError = tool.execute({ day: 5, month: 13, year: 2026 }, { runId: "t", userId: "u" }) as { error?: string };
    expect(rangeError.error).toContain("1–12");
  });
});
