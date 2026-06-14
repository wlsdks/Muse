import type { JsonObject } from "@muse/shared";

import type { MuseTool } from "./index.js";

/**
 * `lunar_date` — the Korean LUNAR (음력) calendar date for a solar date. Korean
 * users carry lunar birthdays and holidays (설날 = 음 1/1, 추석 = 음 8/15), and the
 * local model cannot compute the lunar calendar reliably. ICU's `dangi` calendar
 * IS the authority, so this is the exact grounded answer — including leap months
 * (윤달). Computed in the Korea timezone (Asia/Seoul), where the lunar calendar's
 * day boundary is defined.
 */

export interface LunarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly leap: boolean;
}

export function solarToLunar(date: Date): LunarDate {
  const parts = new Intl.DateTimeFormat("en-u-ca-dangi", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Seoul",
    year: "numeric"
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const monthRaw = get("month"); // "8" or, for a leap month, "6bis"
  return {
    day: Number.parseInt(get("day"), 10),
    leap: monthRaw.endsWith("bis"),
    month: Number.parseInt(monthRaw, 10),
    year: Number.parseInt(get("relatedYear") || get("year"), 10)
  };
}

export function createLunarDateTool(now: () => Date): MuseTool {
  return {
    definition: {
      description:
        "Returns the Korean LUNAR (음력) calendar date for a solar (양력) date — defaults to TODAY. Answers '오늘 음력 며칠이야?' / \"what's today's lunar date?\" / '2026-09-25는 음력으로 며칠?'. The local model can't compute the lunar calendar reliably; this is the exact answer (ICU dangi calendar, Korea timezone), and it marks a leap month (윤달). Do NOT use for the current solar clock time/date (use time_now) or to convert a LUNAR date BACK to solar (not supported here).",
      domain: "core",
      inputSchema: {
        additionalProperties: false,
        properties: {
          date: { description: "Optional solar date (ISO-8601, e.g. '2026-09-25'). Omit for today.", type: "string" }
        },
        required: [],
        type: "object"
      },
      keywords: ["음력", "양력", "lunar", "설날", "추석", "lunar date", "lunar calendar", "음력 날짜", "음력 생일"],
      name: "lunar_date",
      risk: "read"
    },
    execute: (args): JsonObject => {
      const raw = typeof args["date"] === "string" ? args["date"].trim() : "";
      let date: Date;
      if (raw.length > 0) {
        date = new Date(raw);
        if (Number.isNaN(date.getTime())) return { error: `invalid solar date: '${raw}'` };
      } else {
        date = now();
      }
      const lunar = solarToLunar(date);
      const monthLabel = lunar.leap ? `윤${lunar.month.toString()}월` : `${lunar.month.toString()}월`;
      return {
        isLeapMonth: lunar.leap,
        lunar: `음력 ${lunar.year.toString()}년 ${monthLabel} ${lunar.day.toString()}일`,
        lunarDay: lunar.day,
        lunarMonth: lunar.month,
        lunarYear: lunar.year,
        solar: date.toISOString().slice(0, 10)
      };
    }
  };
}
