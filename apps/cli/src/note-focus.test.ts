import { describe, expect, it } from "vitest";

import { formatNoteFocusSection, selectNoteFocus, type NoteMtime } from "./note-focus.js";

const NOW = Date.parse("2026-06-08T12:00:00Z");
const daysAgo = (d: number): number => NOW - d * 86_400_000;

const f = (relPath: string, d: number): NoteMtime => ({ relPath, mtimeMs: daysAgo(d) });

describe("selectNoteFocus — the note family edited most this week (mtime only)", () => {
  it("returns the family with the most recent edits (≥ minEdits)", () => {
    const focus = selectNoteFocus([
      f("projects/wedding/venue.md", 1), f("projects/wedding/guests.md", 2), f("projects/wedding/budget.md", 3),
      f("journal/2026-06-07.md", 1)
    ], NOW);
    expect(focus).toEqual({ family: "projects", count: 3 });
  });

  it("stays silent on a quiet week (no family hits minEdits)", () => {
    expect(selectNoteFocus([f("journal/a.md", 1), f("projects/b.md", 2)], NOW)).toBeUndefined();
  });

  it("ignores edits OUTSIDE the window", () => {
    expect(selectNoteFocus([
      f("projects/a.md", 20), f("projects/b.md", 21), f("projects/c.md", 22) // all > 7d ago
    ], NOW)).toBeUndefined();
  });

  it("ignores a future mtime (clock skew) and non-finite mtimes", () => {
    expect(selectNoteFocus([
      { relPath: "projects/a.md", mtimeMs: NOW + 86_400_000 },
      { relPath: "projects/b.md", mtimeMs: Number.NaN },
      f("projects/c.md", 1)
    ], NOW)).toBeUndefined(); // only 1 valid in-window edit < minEdits 3
  });

  it("breaks a count tie toward the family with the most-recent edit", () => {
    const focus = selectNoteFocus([
      f("alpha/1.md", 5), f("alpha/2.md", 5), f("alpha/3.md", 5),
      f("beta/1.md", 1), f("beta/2.md", 1), f("beta/3.md", 1)
    ], NOW);
    expect(focus?.family).toBe("beta"); // same count (3), beta edited more recently
  });

  it("groups root-level notes under 'your notes'", () => {
    const focus = selectNoteFocus([f("a.md", 1), f("b.md", 1), f("c.md", 1)], NOW);
    expect(focus).toEqual({ family: "your notes", count: 3 });
  });
});

describe("formatNoteFocusSection", () => {
  it("renders the grounded line for a focus, honest 'edited' wording", () => {
    const out = formatNoteFocusSection({ family: "projects", count: 4 });
    expect(out).toContain("focused on projects");
    expect(out).toContain("4 notes edited in the last week");
    expect(out).not.toMatch(/looked at|opened|read/i); // never claims reads
  });

  it("renders nothing when there's no focus (honest silence)", () => {
    expect(formatNoteFocusSection(undefined)).toBe("");
  });
});
