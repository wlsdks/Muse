/**
 * `muse.calendar.list` used to accept ANY `from`/`to` string, silently
 * fall back to the default now→now+30d window on a parse failure, and
 * never say so — "this week" and "garbagexyz" both returned an empty
 * `{events:[],total:0}` indistinguishable from an honest "nothing in
 * that window" answer. The contract now always echoes the resolved
 * window and discloses when a supplied value couldn't be parsed
 * (tool-calling.md rule 7 — repair, but say so).
 */

import { describe, expect, it } from "vitest";

import { createCalendarMcpServer } from "../src/index.js";

function listTool() {
  const server = createCalendarMcpServer({
    registry: {
      createEvent: async () => ({}),
      deleteEvent: async () => undefined,
      describe: () => [],
      listEvents: async () => [],
      updateEvent: async () => ({})
    } as never
  });
  return server.tools.find((t) => t.name === "list")!;
}

describe("muse.calendar.list window disclosure", () => {
  it("always echoes the resolved window on success, even with no filters", async () => {
    const out = await listTool().execute({}) as { windowFromIso?: string; windowToIso?: string; note?: string };
    expect(out.windowFromIso).toBeDefined();
    expect(out.windowToIso).toBeDefined();
    expect(out.note).toBeUndefined();
  });

  it("discloses when `from`/`to` could not be parsed instead of silently defaulting", async () => {
    const out = await listTool().execute({ from: "this week", to: "alsobad" }) as { note?: string; windowFromIso?: string; windowToIso?: string };
    expect(out.note).toContain("this week");
    expect(out.note).toContain("alsobad");
    expect(out.windowFromIso).toBeDefined();
    expect(out.windowToIso).toBeDefined();
  });

  it("stays silent when a valid ISO-8601 from/to is supplied", async () => {
    const out = await listTool().execute({ from: "2026-06-01T00:00:00.000Z", to: "2026-06-02T00:00:00.000Z" }) as { note?: string; windowFromIso?: string };
    expect(out.note).toBeUndefined();
    expect(out.windowFromIso).toBe("2026-06-01T00:00:00.000Z");
  });
});
