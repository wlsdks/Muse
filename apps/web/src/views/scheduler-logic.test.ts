import { describe, expect, it } from "vitest";

import {
  buildCadenceInput,
  formatCadenceSummary,
  formatTimeOfDay,
  schedulerStatusLabel,
  schedulerStatusTone,
  weekdayName
} from "./scheduler-logic.js";

import type { Translate } from "../i18n/index.js";

// Echoes `key` (plus a JSON dump of interpolation vars when present) so tests
// assert WHICH key + vars each summary kind maps to, without depending on copy.
const echo = ((key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as Translate;

describe("formatTimeOfDay", () => {
  it("zero-pads hour and minute into HH:MM", () => {
    expect(formatTimeOfDay(9, 0)).toBe("09:00");
    expect(formatTimeOfDay(0, 5)).toBe("00:05");
    expect(formatTimeOfDay(23, 59)).toBe("23:59");
  });
});

describe("weekdayName", () => {
  it("maps cron weekday numbers (0=Sunday) to the localized long day name", () => {
    expect(weekdayName(0, "en-US")).toBe("Sunday");
    expect(weekdayName(1, "en-US")).toBe("Monday");
    expect(weekdayName(6, "en-US")).toBe("Saturday");
  });

  it("localizes into Korean for the ko locale", () => {
    expect(weekdayName(1, "ko-KR")).toContain("월요일");
  });
});

describe("formatCadenceSummary", () => {
  it("hourly", () => {
    expect(formatCadenceSummary({ kind: "hourly" }, echo, "en-US")).toBe("scheduler.cadence.hourly");
  });

  it("interval carries minutes", () => {
    expect(formatCadenceSummary({ kind: "interval", minutes: 30 }, echo, "en-US")).toBe(
      'scheduler.cadence.interval:{"minutes":30}'
    );
  });

  it("daily carries the zero-padded time", () => {
    expect(formatCadenceSummary({ hour: 9, kind: "daily", minute: 0 }, echo, "en-US")).toBe(
      'scheduler.cadence.daily:{"time":"09:00"}'
    );
  });

  it("weekdays carries the zero-padded time", () => {
    expect(formatCadenceSummary({ hour: 9, kind: "weekdays", minute: 0 }, echo, "en-US")).toBe(
      'scheduler.cadence.weekdays:{"time":"09:00"}'
    );
  });

  it("weekly carries both the localized weekday name and the time", () => {
    expect(formatCadenceSummary({ hour: 9, kind: "weekly", minute: 0, weekday: 1 }, echo, "en-US")).toBe(
      'scheduler.cadence.weekly:{"time":"09:00","weekday":"Monday"}'
    );
  });

  it("custom carries the raw cron expression", () => {
    expect(formatCadenceSummary({ cronExpression: "*/7 3 1 * *", kind: "custom" }, echo, "en-US")).toBe(
      'scheduler.cadence.custom:{"cron":"*/7 3 1 * *"}'
    );
  });
});

describe("buildCadenceInput — form state -> the exact cadence string sent to the server (never a client-side cadence GRAMMAR of its own)", () => {
  it("daily requires a valid HH:MM time", () => {
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "", kind: "daily", time: "09:00", weekday: 1 })
    ).toBe("daily 09:00");
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "", kind: "daily", time: "", weekday: 1 })
    ).toBeUndefined();
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "", kind: "daily", time: "25:00", weekday: 1 })
    ).toBeUndefined();
  });

  it("weekdays requires a valid HH:MM time", () => {
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "", kind: "weekdays", time: "18:30", weekday: 1 })
    ).toBe("weekdays 18:30");
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "", kind: "weekdays", time: "", weekday: 1 })
    ).toBeUndefined();
  });

  it("weekly composes the EN weekday token (regardless of UI language) + time", () => {
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "", kind: "weekly", time: "09:00", weekday: 5 })
    ).toBe("friday 09:00");
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "", kind: "weekly", time: "09:00", weekday: 0 })
    ).toBe("sunday 09:00");
  });

  it("interval requires an integer 1-59", () => {
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "30", kind: "interval", time: "", weekday: 0 })
    ).toBe("every 30 minutes");
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "0", kind: "interval", time: "", weekday: 0 })
    ).toBeUndefined();
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "60", kind: "interval", time: "", weekday: 0 })
    ).toBeUndefined();
    expect(
      buildCadenceInput({ customText: "", intervalMinutes: "abc", kind: "interval", time: "", weekday: 0 })
    ).toBeUndefined();
  });

  it("custom passes the trimmed raw text through untouched", () => {
    expect(
      buildCadenceInput({ customText: "  매일 오전 9시  ", intervalMinutes: "", kind: "custom", time: "", weekday: 0 })
    ).toBe("매일 오전 9시");
    expect(
      buildCadenceInput({ customText: "   ", intervalMinutes: "", kind: "custom", time: "", weekday: 0 })
    ).toBeUndefined();
  });
});

describe("schedulerStatusTone", () => {
  it("maps known statuses (any case) to badge tones", () => {
    expect(schedulerStatusTone("SUCCESS")).toBe("ok");
    expect(schedulerStatusTone("FAILED")).toBe("err");
    expect(schedulerStatusTone("RUNNING")).toBe("accent");
    expect(schedulerStatusTone("SKIPPED")).toBe("neutral");
  });

  it("falls back to neutral for null / unknown", () => {
    expect(schedulerStatusTone(null)).toBe("neutral");
    expect(schedulerStatusTone("weird")).toBe("neutral");
  });
});

describe("schedulerStatusLabel", () => {
  it("maps known statuses (any case) to scheduler.status keys", () => {
    expect(schedulerStatusLabel("SUCCESS", echo)).toBe("scheduler.status.success");
    expect(schedulerStatusLabel("FAILED", echo)).toBe("scheduler.status.failed");
    expect(schedulerStatusLabel("RUNNING", echo)).toBe("scheduler.status.running");
    expect(schedulerStatusLabel("SKIPPED", echo)).toBe("scheduler.status.skipped");
  });

  it("falls back to the 'none' key for null / unknown", () => {
    expect(schedulerStatusLabel(null, echo)).toBe("scheduler.status.none");
    expect(schedulerStatusLabel("weird", echo)).toBe("scheduler.status.none");
  });
});
