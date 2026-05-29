import { describe, expect, it } from "vitest";

import { type PersistedReminder, readReminderStatusFilter, serializeReminder } from "../src/personal-reminders-store.js";

const base: PersistedReminder = {
  id: "r1",
  text: "call mom",
  dueAt: "2026-01-01T09:00:00Z",
  status: "pending",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("serializeReminder", () => {
  it("emits only the required fields for a minimal reminder", () => {
    expect(serializeReminder(base)).toEqual({
      createdAt: "2026-01-01T00:00:00Z",
      dueAt: "2026-01-01T09:00:00Z",
      id: "r1",
      status: "pending",
      text: "call mom",
    });
  });

  it("includes recurrence and firedAt when present", () => {
    expect(serializeReminder({ ...base, status: "fired", recurrence: "daily", firedAt: "2026-01-01T09:01:00Z" })).toMatchObject({
      recurrence: "daily",
      firedAt: "2026-01-01T09:01:00Z",
    });
  });

  it("projects only destination + providerId from via (dropping any extra fields)", () => {
    const out = serializeReminder({
      ...base,
      via: { destination: "C1", providerId: "slack", extra: "should-not-leak" } as PersistedReminder["via"],
    });
    expect(out.via).toEqual({ destination: "C1", providerId: "slack" });
  });

  it("omits via / recurrence / firedAt when absent", () => {
    const out = serializeReminder(base);
    expect(out).not.toHaveProperty("via");
    expect(out).not.toHaveProperty("recurrence");
    expect(out).not.toHaveProperty("firedAt");
  });
});

describe("readReminderStatusFilter", () => {
  it("passes through the recognised fired / all / due filters", () => {
    expect(readReminderStatusFilter("fired")).toBe("fired");
    expect(readReminderStatusFilter("all")).toBe("all");
    expect(readReminderStatusFilter("due")).toBe("due");
  });

  it("defaults to 'pending' for unset, empty, or unrecognised values", () => {
    expect(readReminderStatusFilter("pending")).toBe("pending");
    expect(readReminderStatusFilter(undefined)).toBe("pending");
    expect(readReminderStatusFilter("")).toBe("pending");
    expect(readReminderStatusFilter("bogus")).toBe("pending");
  });
});
