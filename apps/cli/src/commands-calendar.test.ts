import { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  eventsToAvailability,
  formatAvailability,
  maxOfNumbers,
  minOfNumbers,
  registerCalendarCommands,
  type CalendarCommandHelpers
} from "./commands-calendar.js";

describe("minOfNumbers / maxOfNumbers — reduce-based min/max so a large `.ics` import range computation can't RangeError on `Math.min(...arr)` spread", () => {
  it("returns the min / max of a small array", () => {
    expect(minOfNumbers([3, 1, 2])).toBe(1);
    expect(maxOfNumbers([3, 1, 2])).toBe(3);
    expect(minOfNumbers([-5, 0, 5])).toBe(-5);
    expect(maxOfNumbers([-5, 0, 5])).toBe(5);
  });

  it("handles a single element", () => {
    expect(minOfNumbers([42])).toBe(42);
    expect(maxOfNumbers([42])).toBe(42);
  });

  it("returns the Infinity seeds for an empty array (the documented empty-input fallback; callers guard against empty)", () => {
    expect(minOfNumbers([])).toBe(Infinity);
    expect(maxOfNumbers([])).toBe(-Infinity);
  });

  it("does NOT RangeError on a very large array — `Math.min(...arr)` / `Math.max(...arr)` spread every element as a call argument and overflow the engine's argument-count limit; the reduce never spreads", () => {
    // 200k elements is comfortably past V8's spread argument-count
    // ceiling, where `Math.min(...arr)` throws RangeError.
    const big = Array.from({ length: 200_000 }, (_, i) => i);
    expect(maxOfNumbers(big)).toBe(199_999);
    expect(minOfNumbers(big)).toBe(0);
  });
});

describe("eventsToAvailability — payload rows → availability engine shape", () => {
  it("maps startsAtIso/endsAtIso/title/allDay and skips rows with an unparseable time", () => {
    const out = eventsToAvailability([
      { endsAtIso: "2026-05-25T11:00:00", startsAtIso: "2026-05-25T10:00:00", title: "Standup" },
      { allDay: true, endsAtIso: "2026-05-26T00:00:00", startsAtIso: "2026-05-25T00:00:00", title: "Holiday" },
      { endsAtIso: "nope", startsAtIso: "2026-05-25T12:00:00", title: "Bad" }
    ]);
    expect(out.map((e) => e.title)).toEqual(["Standup", "Holiday"]);
    expect(out[1]!.allDay).toBe(true);
  });
});

describe("formatAvailability — human free/busy summary", () => {
  const win = { from: new Date("2026-05-25T09:00:00"), to: new Date("2026-05-25T17:00:00") };
  it("reports fully free over the window", () => {
    expect(formatAvailability({ busy: [], free: [{ endsAt: win.to, startsAt: win.from }], fullyFree: true }, win))
      .toBe("Free all of 09:00–17:00.");
  });
  it("lists busy blocks (with titles) and the free gaps", () => {
    const out = formatAvailability({
      busy: [{ endsAt: new Date("2026-05-25T11:00:00"), startsAt: new Date("2026-05-25T10:00:00"), titles: ["Standup"] }],
      free: [
        { endsAt: new Date("2026-05-25T10:00:00"), startsAt: win.from },
        { endsAt: win.to, startsAt: new Date("2026-05-25T11:00:00") }
      ],
      fullyFree: false
    }, win);
    expect(out).toContain("Busy: 10:00–11:00 Standup");
    expect(out).toContain("Free: 09:00–10:00, 11:00–17:00");
  });
});

async function runCalendarFree(args: string[], events: Array<Record<string, unknown>>): Promise<{
  readonly error?: string;
  readonly json?: unknown;
  readonly stdout: string[];
  readonly apiPaths: string[];
}> {
  const stdout: string[] = [];
  const apiPaths: string[] = [];
  let json: unknown;
  const io = { stderr: () => {}, stdout: (line: string) => stdout.push(line) };
  const helpers: CalendarCommandHelpers = {
    apiRequest: async (_io, _command, path) => { apiPaths.push(path); return { events }; },
    writeOutput: (_io, value) => { json = value; }
  };
  let error: string | undefined;
  try {
    const program = new Command();
    program.exitOverride();
    registerCalendarCommands(program, io, helpers);
    await program.parseAsync(["node", "muse", "calendar", "free", ...args]);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { apiPaths, error, json, stdout };
}

describe("muse calendar free — free/busy over a window (API path, contract-faithful events seam)", () => {
  const window = ["--from", "2026-05-25T09:00:00Z", "--to", "2026-05-25T17:00:00Z"];

  it("computes busy + free from the fetched events (--json)", async () => {
    const r = await runCalendarFree([...window, "--json"], [
      { endsAtIso: "2026-05-25T11:00:00Z", startsAtIso: "2026-05-25T10:00:00Z", title: "Standup" }
    ]);
    expect(r.error).toBeUndefined();
    expect(r.apiPaths[0]).toContain("/api/calendar/events?");
    const out = r.json as { fullyFree: boolean; busy: unknown[]; free: unknown[] };
    expect(out.fullyFree).toBe(false);
    expect(out.busy).toHaveLength(1);
    expect(out.free).toHaveLength(2);
  });

  it("reports fully free when there are no events", async () => {
    const r = await runCalendarFree(window, []);
    expect(r.error).toBeUndefined();
    expect(r.stdout.join("\n")).toContain("Free all of");
  });

  it("rejects a non-numeric --min-minutes before computing", async () => {
    const r = await runCalendarFree([...window, "--min-minutes", "lots"], []);
    expect(r.error).toContain("--min-minutes must be a number");
  });
});
