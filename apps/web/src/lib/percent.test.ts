import { describe, expect, it } from "vitest";

import { formatProbabilityPct } from "./percent.js";

describe("formatProbabilityPct", () => {
  it("null → em-dash", () => {
    expect(formatProbabilityPct(null)).toBe("—");
  });

  it("undefined → em-dash", () => {
    expect(formatProbabilityPct(undefined)).toBe("—");
  });

  it("NaN → em-dash", () => {
    expect(formatProbabilityPct(NaN)).toBe("—");
  });

  it("0 → 0%", () => {
    expect(formatProbabilityPct(0)).toBe("0%");
  });

  it("1 → 100%", () => {
    expect(formatProbabilityPct(1)).toBe("100%");
  });

  it("0.999 → 99% (NOT 100%)", () => {
    expect(formatProbabilityPct(0.999)).toBe("99%");
  });

  it("0.004 → 1% (NOT 0%)", () => {
    expect(formatProbabilityPct(0.004)).toBe("1%");
  });

  it("0.5 → 50%", () => {
    expect(formatProbabilityPct(0.5)).toBe("50%");
  });
});
