import { describe, expect, it } from "vitest";
import type { UserMemory } from "./index.js";
import { projectRecentlyLearned } from "./recently-learned.js";

function mem(
  partial: Partial<Pick<UserMemory, "facts" | "factHistory">>
): Pick<UserMemory, "facts" | "factHistory"> {
  return { facts: partial.facts ?? {}, factHistory: partial.factHistory };
}

describe("projectRecentlyLearned", () => {
  it("returns [] when there is no fact history", () => {
    expect(projectRecentlyLearned(mem({ facts: { home_city: "Seoul" } }))).toEqual([]);
    expect(projectRecentlyLearned(mem({ factHistory: [] }))).toEqual([]);
  });

  it("projects a recorded supersession with its current value and a provenance citation", () => {
    const items = projectRecentlyLearned(
      mem({
        facts: { home_city: "Busan" },
        factHistory: [
          { key: "home_city", previousValue: "Seoul", replacedAt: new Date("2026-06-21T10:00:00Z"), kind: "contradict" }
        ]
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "home_city",
      currentValue: "Busan",
      previousValue: "Seoul",
      kind: "contradict",
      source: 'updated from "Seoul" on 2026-06-21'
    });
  });

  it("orders newest first by replacedAt", () => {
    const items = projectRecentlyLearned(
      mem({
        facts: { a: "1", b: "2" },
        factHistory: [
          { key: "a", previousValue: "old-a", replacedAt: new Date("2026-06-01T00:00:00Z") },
          { key: "b", previousValue: "old-b", replacedAt: new Date("2026-06-20T00:00:00Z") }
        ]
      })
    );
    expect(items.map((i) => i.key)).toEqual(["b", "a"]);
  });

  it("respects the limit (and limit 0 -> [])", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      key: `k${i}`,
      previousValue: `p${i}`,
      replacedAt: new Date(2026, 5, i + 1)
    }));
    expect(projectRecentlyLearned(mem({ facts: {}, factHistory: history }), { limit: 3 })).toHaveLength(3);
    expect(projectRecentlyLearned(mem({ factHistory: history }), { limit: 0 })).toEqual([]);
    expect(projectRecentlyLearned(mem({ factHistory: history }))).toHaveLength(5);
  });

  it("treats a legacy entry with no recorded kind as the conservative 'changed' framing", () => {
    const items = projectRecentlyLearned(
      mem({
        facts: { role: "founder" },
        factHistory: [{ key: "role", previousValue: "student", replacedAt: new Date("2026-06-21T00:00:00Z") }]
      })
    );
    expect(items[0]?.kind).toBe("changed");
  });

  it("reports currentValue undefined when the learned fact was since forgotten", () => {
    const items = projectRecentlyLearned(
      mem({
        facts: {},
        factHistory: [{ key: "pet", previousValue: "cat", replacedAt: new Date("2026-06-21T00:00:00Z"), kind: "refine" }]
      })
    );
    expect(items[0]?.currentValue).toBeUndefined();
    expect(items[0]?.previousValue).toBe("cat");
  });
});
