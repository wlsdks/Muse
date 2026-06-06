import { describe, expect, it } from "vitest";

import { openLoops, type TaskLike } from "../src/open-loops.js";

const NOW = Date.UTC(2026, 5, 1);
const daysAgo = (d: number): string => new Date(NOW - d * 24 * 60 * 60_000).toISOString();

describe("openLoops — Zeigarnik/Ovsiankina unfinished, unscheduled loops", () => {
  const tasks: TaskLike[] = [
    { title: "call the dentist", status: "open", createdAt: daysAgo(20) },              // old, unscheduled → LOOP
    { title: "file taxes", status: "open", createdAt: daysAgo(40) },                    // older, unscheduled → LOOP (first)
    { title: "buy milk", status: "open", createdAt: daysAgo(20), dueAt: daysAgo(-1) },  // has a plan (due) → NOT a loop
    { title: "fresh idea", status: "open", createdAt: daysAgo(1) },                     // too fresh → NOT yet
    { title: "old chore", status: "done", createdAt: daysAgo(30) }                      // done → NOT
  ];

  it("surfaces only OPEN + UNSCHEDULED + aged tasks, oldest (most-nagging) first", () => {
    const loops = openLoops(tasks, { nowMs: NOW });
    expect(loops.map((l) => l.title)).toEqual(["file taxes", "call the dentist"]);
    expect(loops[0]!.ageDays).toBeCloseTo(40, 0);
  });

  it("a task WITH a due date is not a loop (it already has a plan)", () => {
    expect(openLoops([{ title: "scheduled", status: "open", createdAt: daysAgo(30), dueAt: daysAgo(-2) }], { nowMs: NOW })).toEqual([]);
  });

  it("respects minAgeDays (a fresh task isn't nagging yet) and caps results", () => {
    expect(openLoops([{ title: "x", status: "open", createdAt: daysAgo(1) }], { nowMs: NOW })).toEqual([]);
    const many: TaskLike[] = Array.from({ length: 12 }, (_, i) => ({ title: `t${i}`, status: "open", createdAt: daysAgo(10 + i) }));
    expect(openLoops(many, { nowMs: NOW, maxResults: 5 })).toHaveLength(5);
  });
});
