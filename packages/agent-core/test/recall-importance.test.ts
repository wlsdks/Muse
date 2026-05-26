import { describe, expect, it } from "vitest";

import {
  computeImportanceBoost,
  InMemoryEpisodicRecallProvider
} from "../src/episodic-recall.js";

describe("computeImportanceBoost", () => {
  it("returns 0 for undefined / non-finite importance", () => {
    expect(computeImportanceBoost(undefined, 0.15)).toBe(0);
    expect(computeImportanceBoost(Number.NaN, 0.15)).toBe(0);
  });

  it("scales linearly between weight/10 (importance 1) and weight (importance 10)", () => {
    expect(computeImportanceBoost(10, 0.15)).toBeCloseTo(0.15, 10);
    expect(computeImportanceBoost(5, 0.15)).toBeCloseTo(0.075, 10);
    expect(computeImportanceBoost(1, 0.15)).toBeCloseTo(0.015, 10);
  });

  it("clamps out-of-range importance to 1..10", () => {
    expect(computeImportanceBoost(0, 0.15)).toBeCloseTo(0.015, 10);
    expect(computeImportanceBoost(99, 0.15)).toBeCloseTo(0.15, 10);
  });

  it("returns 0 when the weight is 0 (feature disabled)", () => {
    expect(computeImportanceBoost(10, 0)).toBe(0);
  });
});

describe("InMemoryEpisodicRecallProvider importance ranking", () => {
  // Two episodes with the SAME narrative (equal relevance) and SAME createdAt
  // (equal recency) — only importance differs, so it is the sole tie-breaker.
  const narrative = "Discussed the Muse episodic recall ranker design";
  const createdAtIso = "2026-05-20T00:00:00.000Z";
  const now = () => Date.parse("2026-05-21T00:00:00.000Z");

  it("ranks the higher-importance episode first at equal relevance + recency", () => {
    const provider = new InMemoryEpisodicRecallProvider({
      now,
      minScore: 0,
      episodes: [
        { sessionId: "low", narrative, createdAtIso, importance: 2 },
        { sessionId: "high", narrative, createdAtIso, importance: 9 }
      ]
    });
    const snapshot = provider.resolve("episodic recall ranker");
    expect(snapshot?.matches[0]?.sessionId).toBe("high");
    expect(snapshot?.matches[1]?.sessionId).toBe("low");
  });

  it("applies no importance boost when importance is undefined (legacy episode)", () => {
    const withImportance = new InMemoryEpisodicRecallProvider({
      now,
      minScore: 0,
      episodes: [{ sessionId: "s", narrative, createdAtIso, importance: 8 }]
    });
    const without = new InMemoryEpisodicRecallProvider({
      now,
      minScore: 0,
      episodes: [{ sessionId: "s", narrative, createdAtIso }]
    });
    const scored = withImportance.resolve("episodic recall ranker")?.matches[0]?.similarity ?? 0;
    const baseline = without.resolve("episodic recall ranker")?.matches[0]?.similarity ?? 0;
    expect(scored).toBeGreaterThan(baseline);
    expect(scored - baseline).toBeCloseTo(computeImportanceBoost(8, 0.15), 10);
  });

  it("importanceWeight=0 makes ranking byte-identical to no importance", () => {
    const provider = new InMemoryEpisodicRecallProvider({
      now,
      minScore: 0,
      importanceWeight: 0,
      episodes: [{ sessionId: "s", narrative, createdAtIso, importance: 10 }]
    });
    const without = new InMemoryEpisodicRecallProvider({
      now,
      minScore: 0,
      episodes: [{ sessionId: "s", narrative, createdAtIso }]
    });
    const a = provider.resolve("episodic recall ranker")?.matches[0]?.similarity ?? 0;
    const b = without.resolve("episodic recall ranker")?.matches[0]?.similarity ?? 0;
    expect(a).toBeCloseTo(b, 10);
  });
});
