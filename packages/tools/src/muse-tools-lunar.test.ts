import { describe, expect, it } from "vitest";

import { createLunarDateTool, solarToLunar } from "./muse-tools-lunar.js";

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
});
