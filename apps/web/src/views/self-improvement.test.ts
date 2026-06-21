import { describe, expect, it } from "vitest";

import { summarizeWeaknesses, weaknessAxisLabel } from "./self-improvement.js";

describe("weaknessAxisLabel", () => {
  it("grounding-gap → Grounding gap", () => {
    expect(weaknessAxisLabel("grounding-gap")).toBe("Grounding gap");
  });

  it("source-conflict → Conflicting notes", () => {
    expect(weaknessAxisLabel("source-conflict")).toBe("Conflicting notes");
  });

  it("time-parse → Time parsing", () => {
    expect(weaknessAxisLabel("time-parse")).toBe("Time parsing");
  });

  it("misgrounding → Possible misgrounding", () => {
    expect(weaknessAxisLabel("misgrounding")).toBe("Possible misgrounding");
  });

  it("wrong-tool → Wrong tool", () => {
    expect(weaknessAxisLabel("wrong-tool")).toBe("Wrong tool");
  });

  it("unknown axis → returned unchanged", () => {
    expect(weaknessAxisLabel("something-unknown")).toBe("something-unknown");
  });
});

describe("summarizeWeaknesses", () => {
  it("empty list → total 0, axes 0", () => {
    expect(summarizeWeaknesses([])).toEqual({ total: 0, axes: 0 });
  });

  it("counts total entries", () => {
    const entries = [
      { axis: "grounding-gap" },
      { axis: "grounding-gap" },
      { axis: "time-parse" }
    ];
    expect(summarizeWeaknesses(entries).total).toBe(3);
  });

  it("counts distinct axes", () => {
    const entries = [
      { axis: "grounding-gap" },
      { axis: "grounding-gap" },
      { axis: "time-parse" }
    ];
    expect(summarizeWeaknesses(entries).axes).toBe(2);
  });

  it("single entry with unique axis → total 1, axes 1", () => {
    expect(summarizeWeaknesses([{ axis: "misgrounding" }])).toEqual({ total: 1, axes: 1 });
  });
});
