import { describe, expect, it } from "vitest";

import { scaleToolOutputBudget } from "../src/tool-output-importance.js";

describe("scaleToolOutputBudget", () => {
  it("leaves the cap unchanged on a large window (window cap exceeds configured)", () => {
    // 128k tokens * 4 * 0.1 = 51200 >> 8000 → configured ceiling wins.
    expect(scaleToolOutputBudget(128_000, 8_000)).toBe(8_000);
  });

  it("shrinks the cap on a small local window", () => {
    // 8192 * 4 * 0.1 = 3276 → below the 8000 ceiling.
    expect(scaleToolOutputBudget(8_192, 8_000)).toBe(3_276);
  });

  it("never returns below the floor, but never above the configured ceiling", () => {
    // tiny window: window cap (4000*4*0.1=1600) still >= 1000 floor.
    expect(scaleToolOutputBudget(4_000, 8_000)).toBe(1_600);
    // very tiny window: floor kicks in but capped at configured.
    expect(scaleToolOutputBudget(500, 8_000)).toBe(1_000);
    // configured below the floor: result never exceeds configured.
    expect(scaleToolOutputBudget(500, 600)).toBe(600);
  });

  it("is a no-op for an unknown / invalid window", () => {
    expect(scaleToolOutputBudget(undefined, 8_000)).toBe(8_000);
    expect(scaleToolOutputBudget(0, 8_000)).toBe(8_000);
    expect(scaleToolOutputBudget(Number.NaN, 8_000)).toBe(8_000);
  });

  it("preserves the cap-disabled convention (configured <= 0)", () => {
    expect(scaleToolOutputBudget(8_192, 0)).toBe(0);
  });
});
