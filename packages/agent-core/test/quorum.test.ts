import { describe, expect, it } from "vitest";

import { DEFAULT_QUORUM, independentWitnessCount, quorumVerdict } from "../src/quorum.js";

describe("quorumVerdict — confidence by independent-witness count (never a hard refusal)", () => {
  it("0 witnesses → 'none' (unsupported), 1 → 'single', ≥ quorum → 'corroborated'", () => {
    expect(quorumVerdict(0)).toBe("none");
    expect(quorumVerdict(1)).toBe("single");
    expect(quorumVerdict(2)).toBe("corroborated");
    expect(quorumVerdict(5)).toBe("corroborated");
  });

  it("honours a higher quorum: with quorum 3, two witnesses are still only 'single'", () => {
    expect(quorumVerdict(2, 3)).toBe("single");
    expect(quorumVerdict(3, 3)).toBe("corroborated");
  });

  it("clamps a meaningless quorum (< 2, fractional, non-finite) to the default of 2", () => {
    expect(DEFAULT_QUORUM).toBe(2);
    expect(quorumVerdict(2, 1)).toBe("corroborated"); // quorum of 1 is meaningless → clamped to 2
    expect(quorumVerdict(2, 0)).toBe("corroborated");
    expect(quorumVerdict(2, Number.NaN)).toBe("corroborated");
    expect(quorumVerdict(2, 2.9)).toBe("corroborated"); // truncated to 2
  });

  it("never returns 'none' for a positive witness count (a single source is answered, not refused)", () => {
    for (const n of [1, 2, 3, 10]) {
      expect(quorumVerdict(n)).not.toBe("none");
    }
  });

  it("treats a non-finite / negative count as unsupported", () => {
    expect(quorumVerdict(-1)).toBe("none");
    expect(quorumVerdict(Number.NaN)).toBe("none");
  });
});

describe("independentWitnessCount — distinct supporting sources, deduped", () => {
  it("counts distinct trimmed non-empty sources", () => {
    expect(independentWitnessCount(["lease.md", "lease.md", "budget.md"])).toBe(2);
    expect(independentWitnessCount([" lease.md ", "lease.md"])).toBe(1);
    expect(independentWitnessCount([])).toBe(0);
    expect(independentWitnessCount(["", "  "])).toBe(0);
  });
});
