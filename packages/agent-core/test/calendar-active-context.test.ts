import { describe, expect, it } from "vitest";

import {
  DefaultActiveContextProvider,
  renderActiveContextSection,
  type CalendarEventsResolver
} from "../src/active-context.js";

const fixedNow = new Date("2026-05-11T08:00:00.000Z");

describe("active context calendar surface (D1)", () => {
  it("renders today_events block with chronological order", () => {
    const rendered = renderActiveContextSection({
      localHour: 8,
      nowIso: fixedNow.toISOString(),
      timezone: "UTC",
      todaysEvents: [
        { endIso: "2026-05-11T10:00:00.000Z", startIso: "2026-05-11T09:00:00.000Z", title: "Standup" },
        { allDay: true, location: "HQ", startIso: "2026-05-11T00:00:00.000Z", title: "Quarterly Planning" }
      ],
      weekday: "Monday"
    });
    expect(rendered).toContain("today_events:");
    expect(rendered).toContain("Standup");
    expect(rendered).toContain("Quarterly Planning");
    expect(rendered).toContain("@ HQ");
    expect(rendered).toContain("(all day)");
  });

  it("DefaultActiveContextProvider feeds events through the resolver", async () => {
    const resolver: CalendarEventsResolver = {
      async resolve() {
        return [
          { endIso: "2026-05-11T10:00:00.000Z", startIso: "2026-05-11T09:00:00.000Z", title: "Standup" }
        ];
      }
    };
    const provider = new DefaultActiveContextProvider({
      calendarEventsResolver: resolver,
      defaultTimezone: "UTC",
      now: () => fixedNow
    });
    const snapshot = await provider.resolve();
    expect(snapshot?.todaysEvents).toHaveLength(1);
    expect(snapshot?.todaysEvents?.[0]?.title).toBe("Standup");
  });

  it("fails open when calendar resolver throws", async () => {
    const provider = new DefaultActiveContextProvider({
      calendarEventsResolver: {
        async resolve() {
          throw new Error("network down");
        }
      },
      defaultTimezone: "UTC",
      now: () => fixedNow
    });
    const snapshot = await provider.resolve();
    expect(snapshot?.todaysEvents).toBeUndefined();
    // base fields still populated
    expect(snapshot?.nowIso).toBe(fixedNow.toISOString());
  });
});
