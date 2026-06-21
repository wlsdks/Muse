import type { PlaybookEntry, WeaknessEntry } from "@muse/mcp";
import { describe, expect, it } from "vitest";

import { shapePlaybook, shapeWeaknesses } from "./self-improvement-routes.js";

function entry(partial: Partial<WeaknessEntry> & { topic: string; count: number; lastSeen: string }): WeaknessEntry {
  return {
    axis: "grounding-gap",
    firstSeen: "2026-06-01T00:00:00Z",
    ...partial
  } as WeaknessEntry;
}

describe("shapeWeaknesses", () => {
  it("orders by count descending, then most-recent lastSeen", () => {
    const out = shapeWeaknesses([
      entry({ topic: "a", count: 2, lastSeen: "2026-06-10T00:00:00Z" }),
      entry({ topic: "b", count: 5, lastSeen: "2026-06-02T00:00:00Z" }),
      entry({ topic: "c", count: 2, lastSeen: "2026-06-20T00:00:00Z" })
    ]);
    expect(out.entries.map((e) => e.topic)).toEqual(["b", "c", "a"]);
  });

  it("reports the total and never drops an entry", () => {
    const out = shapeWeaknesses([
      entry({ topic: "a", count: 1, lastSeen: "2026-06-10T00:00:00Z" }),
      entry({ topic: "b", count: 1, lastSeen: "2026-06-11T00:00:00Z" })
    ]);
    expect(out.total).toBe(2);
    expect(out.entries).toHaveLength(2);
  });

  it("normalizes absent hint/pKnown to null (JSON-friendly), present ones pass through", () => {
    const out = shapeWeaknesses([
      entry({ topic: "a", count: 1, lastSeen: "2026-06-10T00:00:00Z" }),
      entry({ topic: "b", count: 1, lastSeen: "2026-06-10T00:00:00Z", hint: "add a note", pKnown: 0.4 })
    ]);
    const a = out.entries.find((e) => e.topic === "a")!;
    const b = out.entries.find((e) => e.topic === "b")!;
    expect(a.hint).toBeNull();
    expect(a.pKnown).toBeNull();
    expect(b.hint).toBe("add a note");
    expect(b.pKnown).toBe(0.4);
  });

  it("preserves a pKnown of exactly 0 (a real value, not 'absent')", () => {
    const out = shapeWeaknesses([entry({ topic: "a", count: 1, lastSeen: "2026-06-10T00:00:00Z", pKnown: 0 })]);
    expect(out.entries[0]!.pKnown).toBe(0);
  });

  it("an empty ledger is total 0, not a crash", () => {
    expect(shapeWeaknesses([])).toEqual({ total: 0, entries: [] });
  });
});

function pbEntry(partial: Partial<PlaybookEntry> & { id: string; text: string; createdAt: string }): PlaybookEntry {
  return {
    userId: "u1",
    ...partial
  } as PlaybookEntry;
}

describe("shapePlaybook", () => {
  it("orders by reward DESC, tie-break by recency DESC", () => {
    const out = shapePlaybook([
      pbEntry({ id: "a", text: "a", createdAt: "2026-06-10T00:00:00Z", reward: 1 }),
      pbEntry({ id: "b", text: "b", createdAt: "2026-06-02T00:00:00Z", reward: 3 }),
      pbEntry({ id: "c", text: "c", createdAt: "2026-06-15T00:00:00Z", reward: 1 })
    ]);
    expect(out.entries.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("tie-breaks by lastReinforcedAt when present (newest first)", () => {
    const out = shapePlaybook([
      pbEntry({ id: "a", text: "a", createdAt: "2026-06-01T00:00:00Z", reward: 2, lastReinforcedAt: "2026-06-05T00:00:00Z" }),
      pbEntry({ id: "b", text: "b", createdAt: "2026-06-01T00:00:00Z", reward: 2, lastReinforcedAt: "2026-06-20T00:00:00Z" })
    ]);
    expect(out.entries.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("treats absent reward as 0 for ordering", () => {
    const out = shapePlaybook([
      pbEntry({ id: "a", text: "a", createdAt: "2026-06-10T00:00:00Z" }),
      pbEntry({ id: "b", text: "b", createdAt: "2026-06-20T00:00:00Z", reward: 0 }),
      pbEntry({ id: "c", text: "c", createdAt: "2026-06-05T00:00:00Z", reward: 1 })
    ]);
    expect(out.entries[0]!.id).toBe("c");
    const zeroIds = out.entries.slice(1).map((e) => e.id);
    expect(zeroIds).toContain("a");
    expect(zeroIds).toContain("b");
    expect(zeroIds[0]).toBe("b");
  });

  it("reports total and never drops an entry", () => {
    const out = shapePlaybook([
      pbEntry({ id: "a", text: "a", createdAt: "2026-06-10T00:00:00Z" }),
      pbEntry({ id: "b", text: "b", createdAt: "2026-06-11T00:00:00Z" })
    ]);
    expect(out.total).toBe(2);
    expect(out.entries).toHaveLength(2);
  });

  it("normalizes absent tag/origin/source to null, present values pass through", () => {
    const out = shapePlaybook([
      pbEntry({ id: "a", text: "a", createdAt: "2026-06-10T00:00:00Z" }),
      pbEntry({ id: "b", text: "b", createdAt: "2026-06-10T00:00:00Z", tag: "scheduling", origin: "grounded", source: "because X" })
    ]);
    const a = out.entries.find((e) => e.id === "a")!;
    const b = out.entries.find((e) => e.id === "b")!;
    expect(a.tag).toBeNull();
    expect(a.origin).toBeNull();
    expect(a.source).toBeNull();
    expect(b.tag).toBe("scheduling");
    expect(b.origin).toBe("grounded");
    expect(b.source).toBe("because X");
  });

  it("normalizes absent reward to 0, absent probation to false, absent timesObserved to 1", () => {
    const out = shapePlaybook([pbEntry({ id: "a", text: "a", createdAt: "2026-06-10T00:00:00Z" })]);
    expect(out.entries[0]!.reward).toBe(0);
    expect(out.entries[0]!.probation).toBe(false);
    expect(out.entries[0]!.timesObserved).toBe(1);
  });

  it("preserves present reward/probation/timesObserved values", () => {
    const out = shapePlaybook([pbEntry({ id: "a", text: "a", createdAt: "2026-06-10T00:00:00Z", reward: 3, probation: true, timesObserved: 5 })]);
    expect(out.entries[0]!.reward).toBe(3);
    expect(out.entries[0]!.probation).toBe(true);
    expect(out.entries[0]!.timesObserved).toBe(5);
  });

  it("an empty playbook is total 0, not a crash", () => {
    expect(shapePlaybook([])).toEqual({ total: 0, entries: [] });
  });
});
