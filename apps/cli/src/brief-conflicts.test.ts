import { describe, expect, it } from "vitest";

import { formatBriefConflicts } from "./brief-conflicts.js";

const ev = (title: string, startIso: string, endIso: string) => ({ endsAt: new Date(endIso), startsAt: new Date(startIso), title });

describe("formatBriefConflicts", () => {
  it("renders a double-booked block naming each clashing pair with start times", () => {
    const out = formatBriefConflicts([
      {
        a: ev("Standup", "2026-06-10T09:00:00Z", "2026-06-10T09:30:00Z"),
        b: ev("Dentist", "2026-06-10T09:15:00Z", "2026-06-10T10:00:00Z"),
        overlapEndsAt: new Date("2026-06-10T09:30:00Z"),
        overlapStartsAt: new Date("2026-06-10T09:15:00Z")
      }
    ]);
    expect(out).toContain("Heads up — you're double-booked");
    expect(out).toContain('"Standup"');
    expect(out).toContain('"Dentist"');
  });

  it("is an empty string when there are no conflicts (nothing added to the brief)", () => {
    expect(formatBriefConflicts([])).toBe("");
  });
});
