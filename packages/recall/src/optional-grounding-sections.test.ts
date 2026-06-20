import { describe, expect, it } from "vitest";

import { groundingSectionLines, optionalGroundingSections, type OptionalGroundingSources } from "./present.js";

const allAbsent: OptionalGroundingSources = {
  tasks: { body: "", present: false },
  calendar: { body: "", present: false },
  reminders: { body: "", present: false },
  contacts: { body: "", present: false },
  memories: { body: "", present: false },
  shell: { body: "", present: false },
  git: { body: "", present: false },
  actions: { body: "", present: false },
  episodes: { body: "", present: false },
  feeds: { body: "", present: false },
  reflection: { body: "", present: false }
};

describe("optionalGroundingSections", () => {
  it("emits ONLY the present sections, each with its header/footer label and present:true", () => {
    // With every section absent, no spec is emitted at all (no empty-block prompt bloat).
    expect(optionalGroundingSections(allAbsent)).toEqual([]);

    // A single present section round-trips its header + footer labels.
    const specs = optionalGroundingSections({ ...allAbsent, contacts: { body: "<c>", present: true } });
    expect(specs).toHaveLength(1);
    expect(specs[0]?.header).toBe("=== MATCHING CONTACTS (from your address book) ===");
    expect(specs[0]?.footer).toBe("=== END CONTACTS ===");
    expect(specs[0]?.present).toBe(true);
  });

  it("carries each source's body + present through to the matching spec", () => {
    const specs = optionalGroundingSections({ ...allAbsent, tasks: { body: "<task 1>", present: true } });
    expect(specs[0]?.body).toBe("<task 1>");
    expect(specs[0]?.present).toBe(true);
  });

  it("groundingSectionLines drops absent sections and renders present ones in order", () => {
    const lines = groundingSectionLines(
      optionalGroundingSections({
        ...allAbsent,
        tasks: { body: "T", present: true },
        feeds: { body: "F", present: true }
      })
    );
    // only tasks + feeds survive, each as header/body/footer/"" — tasks before feeds
    expect(lines).toEqual([
      "=== USER OPEN TASKS (sorted by due date, most imminent first) ===", "T", "=== END TASKS ===", "",
      "=== RECENT FEED HEADLINES (your watched RSS/Atom feeds, newest first) ===", "F", "=== END FEED HEADLINES ===", ""
    ]);
  });

  it("an all-absent input yields zero rendered lines (no empty-block prompt bloat)", () => {
    expect(groundingSectionLines(optionalGroundingSections(allAbsent))).toEqual([]);
  });

  it("edge-places the highest-relevance present block at HEAD or TAIL, not the middle, and keeps the set invariant", () => {
    // reminders is a MIDDLE block by the old fixed array order (index 2 of the 5
    // present) but carries the HIGHEST relevance; tasks is the FIRST block by old
    // order but LOW relevance. Lost-in-the-middle: the highest-relevance block
    // must LEAVE the middle for an edge (head/tail).
    const present: OptionalGroundingSources = {
      ...allAbsent,
      tasks: { body: "TASKS", present: true, relevance: 0.01 },
      calendar: { body: "CAL", present: true, relevance: 0.2 },
      reminders: { body: "REM", present: true, relevance: 0.99 },
      contacts: { body: "CON", present: true, relevance: 0.4 },
      memories: { body: "MEM", present: true, relevance: 0.3 }
    };
    const specs = optionalGroundingSections(present);
    const headers = specs.map((s) => s.header);

    const remindersHeader = "=== PENDING REMINDERS (sorted by due date) ===";
    // (a) highest-relevance (reminders) lands at an EDGE of the optional region —
    // NOT its old middle slot. Goes RED under identity/fixed-order render.
    const remIdx = headers.indexOf(remindersHeader);
    expect(remIdx === 0 || remIdx === headers.length - 1).toBe(true);
    expect(remIdx).not.toBe(2);

    // (b) set-equality: every PRESENT block header appears exactly once, no ABSENT block leaks in.
    const presentHeaders = [
      "=== USER OPEN TASKS (sorted by due date, most imminent first) ===",
      "=== UPCOMING CALENDAR EVENTS (sorted chronologically) ===",
      remindersHeader,
      "=== MATCHING CONTACTS (from your address book) ===",
      "=== FACTS YOU TOLD MUSE TO REMEMBER (cite as [memory: <topic>]) ==="
    ];
    expect(specs).toHaveLength(presentHeaders.length);
    expect([...headers].sort()).toEqual([...presentHeaders].sort());
    for (const h of presentHeaders) {
      expect(headers.filter((x) => x === h)).toHaveLength(1);
    }
    // body still travels with its header (no cross-wiring during the reorder).
    expect(specs[remIdx]?.body).toBe("REM");
  });

  it("falls back to a deterministic priority tier when relevance is absent (stable, no stochastic order)", () => {
    // No relevance scores anywhere — output must be deterministic and identical run-to-run.
    const present: OptionalGroundingSources = {
      ...allAbsent,
      tasks: { body: "T", present: true },
      calendar: { body: "C", present: true },
      memories: { body: "M", present: true }
    };
    const first = optionalGroundingSections(present).map((s) => s.header);
    const second = optionalGroundingSections(present).map((s) => s.header);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect([...first].sort()).toEqual([
      "=== FACTS YOU TOLD MUSE TO REMEMBER (cite as [memory: <topic>]) ===",
      "=== UPCOMING CALENDAR EVENTS (sorted chronologically) ===",
      "=== USER OPEN TASKS (sorted by due date, most imminent first) ==="
    ].sort());
  });
});
