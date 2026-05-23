import { describe, expect, it } from "vitest";

import { fireReminder, nextReminderOccurrence, type PersistedReminder } from "../src/index.js";

describe("nextReminderOccurrence — advance past the fire time, skip missed slots", () => {
  it("daily: advances one day when fired on time", () => {
    expect(nextReminderOccurrence("2026-05-24T09:00:00.000Z", "daily", "2026-05-24T09:00:00.000Z"))
      .toBe("2026-05-25T09:00:00.000Z");
  });

  it("weekly: advances seven days", () => {
    expect(nextReminderOccurrence("2026-05-24T09:00:00.000Z", "weekly", "2026-05-24T09:00:01.000Z"))
      .toBe("2026-05-31T09:00:00.000Z");
  });

  it("skips missed occurrences to the next FUTURE slot (daemon was off for days)", () => {
    // due Monday, fired the following Thursday → next daily slot is Friday, not a backlog.
    const next = nextReminderOccurrence("2026-05-18T09:00:00.000Z", "daily", "2026-05-21T10:00:00.000Z");
    expect(Date.parse(next)).toBeGreaterThan(Date.parse("2026-05-21T10:00:00.000Z"));
    expect(next).toBe("2026-05-22T09:00:00.000Z");
  });

  it("returns dueAt unchanged on an unparseable timestamp (defensive)", () => {
    expect(nextReminderOccurrence("not-a-date", "daily", "2026-05-24T09:00:00.000Z")).toBe("not-a-date");
  });
});

describe("fireReminder — recurring re-arms (stays pending), one-shot fires", () => {
  const base: PersistedReminder = { createdAt: "2026-05-24T08:00:00.000Z", dueAt: "2026-05-24T09:00:00.000Z", id: "r1", status: "pending", text: "standup" };

  it("a one-shot reminder flips to fired with firedAt", () => {
    const next = fireReminder([base], "r1", "2026-05-24T09:00:05.000Z")!;
    expect(next[0]).toMatchObject({ firedAt: "2026-05-24T09:00:05.000Z", status: "fired" });
  });

  it("a recurring reminder stays pending and advances dueAt to the next occurrence", () => {
    const recurring: PersistedReminder = { ...base, recurrence: "weekly" };
    const next = fireReminder([recurring], "r1", "2026-05-24T09:00:05.000Z")!;
    expect(next[0]!.status).toBe("pending");
    expect(next[0]!.dueAt).toBe("2026-05-31T09:00:00.000Z");
    expect(next[0]!.firedAt).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(fireReminder([base], "nope", "2026-05-24T09:00:05.000Z")).toBeUndefined();
  });
});
