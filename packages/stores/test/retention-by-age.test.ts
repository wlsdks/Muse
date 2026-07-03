import { describe, expect, it } from "vitest";

import { ageCutoffMs, pruneByAge } from "../src/retention.js";

const DAY_MS = 86_400_000;

describe("pruneByAge — pure age-cutoff partition", () => {
  it("drops entries older than the window and keeps recent ones", () => {
    const now = Date.parse("2026-07-02T00:00:00Z");
    const entries = [
      { id: "old", ts: now - 100 * DAY_MS },
      { id: "boundary-just-inside", ts: now - 89 * DAY_MS },
      { id: "recent", ts: now - 1 * DAY_MS }
    ];
    const { kept, dropped } = pruneByAge(entries, { ageDays: 90, now, timestampOf: (e) => e.ts });
    expect(dropped.map((e) => e.id)).toEqual(["old"]);
    expect(kept.map((e) => e.id)).toEqual(["boundary-just-inside", "recent"]);
  });

  it("an entry exactly at the cutoff boundary is KEPT (strict less-than for drop)", () => {
    const now = 1_000_000;
    const entries = [{ ts: now - 10 * DAY_MS }];
    const { kept, dropped } = pruneByAge(entries, { ageDays: 10, now, timestampOf: (e) => e.ts });
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("an unparseable / non-finite timestamp is never dropped (fail-safe)", () => {
    const now = 1_000_000;
    const entries = [{ ts: Number.NaN }];
    const { kept, dropped } = pruneByAge(entries, { ageDays: 1, now, timestampOf: (e) => e.ts });
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("an empty list returns empty kept/dropped", () => {
    const result = pruneByAge<{ ts: number }>([], { ageDays: 5, now: Date.now(), timestampOf: (e) => e.ts });
    expect(result.kept).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  it("ageCutoffMs computes the boundary directly", () => {
    const now = 1_000_000_000;
    expect(ageCutoffMs(1, now)).toBe(now - DAY_MS);
    expect(ageCutoffMs(0, now)).toBe(now);
  });

  it("a negative ageDays clamps to 0 (never a future cutoff / never drops everything unexpectedly)", () => {
    const now = 1_000_000_000;
    expect(ageCutoffMs(-5, now)).toBe(now);
  });
});
