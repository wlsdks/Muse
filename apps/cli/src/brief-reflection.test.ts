import { describe, expect, it } from "vitest";

import { formatBriefReflectionLine, selectBriefReflection } from "./brief-reflection.js";

const NOW = 1_700_000_000_000;
const day = 86_400_000;

const reflection = (over: Partial<Parameters<typeof formatBriefReflectionLine>[0]> = {}) => ({
  createdAtMs: NOW - day,
  id: "r1",
  insight: "You tend to defer the Q3 launch tasks to Fridays.",
  sourceIds: ["ep-1", "ep-2"],
  supportCount: 2,
  ...over
});

describe("selectBriefReflection", () => {
  it("picks the highest-support recent insight, tie-broken by recency", () => {
    const picked = selectBriefReflection(
      [
        reflection({ id: "weak", insight: "low support", supportCount: 1, createdAtMs: NOW }),
        reflection({ id: "strong", insight: "strong", supportCount: 4, createdAtMs: NOW - 2 * day }),
        reflection({ id: "strong-newer", insight: "strong newer", supportCount: 4, createdAtMs: NOW - day })
      ],
      NOW
    );
    expect(picked?.id).toBe("strong-newer"); // same support (4) → most recent wins
  });

  it("skips stale insights older than maxAgeDays", () => {
    const stale = reflection({ createdAtMs: NOW - 30 * day });
    expect(selectBriefReflection([stale], NOW, { maxAgeDays: 14 })).toBeUndefined();
    expect(selectBriefReflection([stale], NOW, { maxAgeDays: 60 })?.id).toBe("r1");
  });

  it("skips empty/future-dated insights and returns undefined when none qualify", () => {
    expect(selectBriefReflection([reflection({ insight: "   " })], NOW)).toBeUndefined();
    expect(selectBriefReflection([reflection({ createdAtMs: NOW + day })], NOW)).toBeUndefined(); // future → skip
    expect(selectBriefReflection([], NOW)).toBeUndefined();
  });
});

describe("formatBriefReflectionLine", () => {
  it("renders the insight verbatim with the looking-back prefix", () => {
    const line = formatBriefReflectionLine(reflection({ supportCount: 1 }));
    expect(line).toContain("💡 Looking back — You tend to defer the Q3 launch tasks to Fridays.");
    expect(line).not.toContain("recurring"); // supportCount 1 → no recurring tag
  });

  it("flags a recurring theme when supportCount > 1", () => {
    expect(formatBriefReflectionLine(reflection({ supportCount: 3 }))).toContain("(a recurring theme, seen 3×)");
  });
});
