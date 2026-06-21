import { describe, expect, it } from "vitest";

import { summarizeSkills } from "./skill-list.js";

describe("summarizeSkills", () => {
  it("empty list → all zero", () => {
    expect(summarizeSkills([])).toEqual({ total: 0, active: 0, avoided: 0 });
  });

  it("counts active vs avoided distinctly", () => {
    const out = summarizeSkills([{ avoided: false }, { avoided: true }, { avoided: false }]);
    expect(out).toEqual({ total: 3, active: 2, avoided: 1 });
  });

  it("all-avoided → active 0", () => {
    expect(summarizeSkills([{ avoided: true }, { avoided: true }])).toEqual({
      total: 2,
      active: 0,
      avoided: 2
    });
  });

  it("all-active → avoided 0", () => {
    expect(summarizeSkills([{ avoided: false }, { avoided: false }])).toEqual({
      total: 2,
      active: 2,
      avoided: 0
    });
  });
});
