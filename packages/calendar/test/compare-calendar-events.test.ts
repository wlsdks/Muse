import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../src/types.js";
import { compareCalendarEvents } from "../src/registry.js";

const event = (iso: string, providerId: string, id: string): CalendarEvent => ({
  id,
  providerId,
  title: "event",
  startsAt: new Date(iso),
  endsAt: new Date(iso),
  allDay: false,
});

describe("compareCalendarEvents", () => {
  it("orders by start time first", () => {
    expect(Math.sign(compareCalendarEvents(event("2026-01-01T09:00:00Z", "a", "1"), event("2026-01-01T10:00:00Z", "a", "2")))).toBe(-1);
    expect(Math.sign(compareCalendarEvents(event("2026-01-01T11:00:00Z", "a", "1"), event("2026-01-01T10:00:00Z", "a", "2")))).toBe(1);
  });

  it("breaks a start-time tie by providerId", () => {
    expect(Math.sign(compareCalendarEvents(event("2026-01-01T09:00:00Z", "aaa", "1"), event("2026-01-01T09:00:00Z", "bbb", "1")))).toBe(-1);
  });

  it("breaks a start-time + providerId tie by id", () => {
    expect(Math.sign(compareCalendarEvents(event("2026-01-01T09:00:00Z", "a", "alpha"), event("2026-01-01T09:00:00Z", "a", "beta")))).toBe(-1);
  });

  it("returns 0 for fully equal sort keys", () => {
    expect(compareCalendarEvents(event("2026-01-01T09:00:00Z", "a", "1"), event("2026-01-01T09:00:00Z", "a", "1"))).toBe(0);
  });

  it("sorts a list time-first, then provider, then id", () => {
    const events = [
      event("2026-01-01T10:00:00Z", "b", "2"),
      event("2026-01-01T09:00:00Z", "z", "9"),
      event("2026-01-01T09:00:00Z", "a", "1"),
    ];
    expect(events.slice().sort(compareCalendarEvents).map((e) => `${e.startsAt.toISOString().slice(11, 16)}/${e.providerId}/${e.id}`)).toEqual([
      "09:00/a/1",
      "09:00/z/9",
      "10:00/b/2",
    ]);
  });
});
