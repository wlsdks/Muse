import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deriveBriefingImminent, deriveCalendarBriefingImminent, type BriefingCalendarEvent } from "../src/briefing-imminent.js";
import { writeTasks, type PersistedTask } from "../src/personal-tasks-store.js";

const NOW = new Date("2026-05-31T12:00:00.000Z"); // window with default lead (120m) = [12:00, 14:00]
const at = (iso: string) => new Date(iso);

describe("deriveCalendarBriefingImminent — calendar imminence, mirrors the proactive daemon", () => {
  const lister = (events: readonly BriefingCalendarEvent[]) => async () => events;
  const ev = (over: Partial<BriefingCalendarEvent> = {}): BriefingCalendarEvent => ({ allDay: false, startsAt: at("2026-05-31T12:30:00Z"), title: "standup", ...over });

  it("includes a timed event that starts within [now, now+lead]", async () => {
    const out = await deriveCalendarBriefingImminent(lister([ev()]), { now: NOW });
    expect(out).toEqual([{ kind: "calendar", startsAt: at("2026-05-31T12:30:00Z"), title: "standup" }]);
  });

  it("skips all-day, before-now, after-window, and unparseable-start events", async () => {
    const out = await deriveCalendarBriefingImminent(lister([
      ev({ allDay: true, title: "holiday" }),
      ev({ startsAt: at("2026-05-31T11:00:00Z"), title: "past" }),
      ev({ startsAt: at("2026-05-31T15:00:00Z"), title: "later" }),
      ev({ startsAt: new Date("nonsense"), title: "nan" })
    ]), { now: NOW });
    expect(out).toEqual([]);
  });

  it("respects the [no-proactive] opt-out in the title OR the notes", async () => {
    const out = await deriveCalendarBriefingImminent(lister([
      ev({ title: "secret meeting [no-proactive]" }),
      ev({ notes: "[no-proactive]", title: "quiet" })
    ]), { now: NOW });
    expect(out).toEqual([]);
  });

  it("uses the lead window to query the lister and defaults a non-finite leadMinutes to 120", async () => {
    let range: { from: Date; to: Date } | undefined;
    const capturing = async (r: { from: Date; to: Date }) => { range = r; return []; };
    await deriveCalendarBriefingImminent(capturing, { leadMinutes: Number.NaN, now: NOW });
    expect(range!.from).toEqual(NOW);
    expect(range!.to.getTime()).toBe(NOW.getTime() + 120 * 60_000); // NaN → default 120
  });

  it("fail-soft: a throwing lister yields [] (the rest of the briefing still goes out)", async () => {
    expect(await deriveCalendarBriefingImminent(async () => { throw new Error("calendar down"); }, { now: NOW })).toEqual([]);
  });
});

describe("deriveBriefingImminent — task imminence", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "muse-brief-")); file = join(dir, "tasks.json"); });
  afterEach(async () => { await rm(dir, { force: true, recursive: true }); });

  const task = (over: Partial<PersistedTask> = {}): PersistedTask => ({ createdAt: "2026-05-01T00:00:00Z", dueAt: "2026-05-31T13:00:00Z", id: "t1", status: "open", title: "ship the report", ...over });

  it("includes an open task whose dueAt is within the lead window", async () => {
    await writeTasks(file, [task()]);
    const out = await deriveBriefingImminent(file, { now: NOW });
    expect(out).toEqual([{ kind: "task", startsAt: new Date("2026-05-31T13:00:00Z"), title: "ship the report" }]);
  });

  it("skips a done task, a task with no dueAt, a proactive:false task, and a due-out-of-window task", async () => {
    await writeTasks(file, [
      task({ id: "done", status: "done" }),
      task({ id: "no-due", dueAt: undefined }),
      task({ id: "opted-out", proactive: false }),
      task({ id: "far", dueAt: "2026-05-31T20:00:00Z" })
    ]);
    expect(await deriveBriefingImminent(file, { now: NOW })).toEqual([]);
  });

  it("returns [] for a missing tasks file (fail-soft)", async () => {
    expect(await deriveBriefingImminent(join(dir, "nope.json"), { now: NOW })).toEqual([]);
  });
});
