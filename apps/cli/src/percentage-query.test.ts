import { describe, expect, it } from "vitest";

import { detectPercentageQuery, formatPercentage } from "./percentage-query.js";

describe("detectPercentageQuery — only a real percentage computation short-circuits", () => {
  it("parses 'X% of Y' (with the optional what's/percent wording and currency)", () => {
    expect(detectPercentageQuery("what's 18% of 54?")).toMatchObject({ kind: "of", percent: 18, base: 54, currency: "" });
    expect(detectPercentageQuery("25 percent of 200")).toMatchObject({ kind: "of", percent: 25, base: 200 });
    expect(detectPercentageQuery("what is 7.5% of $1,200")).toMatchObject({ kind: "of", percent: 7.5, base: 1200, currency: "$" });
  });

  it("parses discounts: 'X% off [of] Y' and 'Y with X% off'", () => {
    expect(detectPercentageQuery("15% off 80")).toMatchObject({ kind: "off", percent: 15, base: 80 });
    expect(detectPercentageQuery("15% off of 80")).toMatchObject({ kind: "off", percent: 15, base: 80 });
    expect(detectPercentageQuery("$80 with 15% off")).toMatchObject({ kind: "off", percent: 15, base: 80, currency: "$" });
  });

  it("parses markups: 'Y plus X%', 'Y increased by X%', 'add X% to Y'", () => {
    expect(detectPercentageQuery("200 plus 8%")).toMatchObject({ kind: "increase", percent: 8, base: 200 });
    expect(detectPercentageQuery("200 increased by 8%")).toMatchObject({ kind: "increase", percent: 8, base: 200 });
    expect(detectPercentageQuery("add 8% to 200")).toMatchObject({ kind: "increase", percent: 8, base: 200 });
  });

  it("parses reductions and tips", () => {
    expect(detectPercentageQuery("200 minus 8%")).toMatchObject({ kind: "decrease", percent: 8, base: 200 });
    expect(detectPercentageQuery("a 20% tip on $45")).toMatchObject({ kind: "tip", percent: 20, base: 45, currency: "$" });
  });

  it("returns null for a non-percentage question (recall is never hijacked)", () => {
    expect(detectPercentageQuery("how many people are coming?")).toBeNull();
    expect(detectPercentageQuery("what percent did sales grow?")).toBeNull(); // no computable base
    expect(detectPercentageQuery("50% of the team likes pizza")).toBeNull();  // base isn't a number
    expect(detectPercentageQuery("is 18% of 54 too much?")).toBeNull();       // not PURELY the computation
    expect(detectPercentageQuery("summarize the launch plan")).toBeNull();
  });
});

describe("formatPercentage — exact, money-framed answers", () => {
  it("frames each kind and echoes the currency", () => {
    expect(formatPercentage({ kind: "of", percent: 18, base: 54, currency: "" })).toBe("18% of 54 is 9.72.");
    expect(formatPercentage({ kind: "off", percent: 15, base: 80, currency: "$" })).toBe("15% off $80 is $68 (you save $12).");
    expect(formatPercentage({ kind: "increase", percent: 8, base: 200, currency: "" })).toBe("200 plus 8% is 216.");
    expect(formatPercentage({ kind: "decrease", percent: 8, base: 200, currency: "" })).toBe("200 minus 8% is 184.");
    expect(formatPercentage({ kind: "tip", percent: 20, base: 45, currency: "$" })).toBe("A 20% tip on $45 is $9 (total $54).");
  });

  it("rounds to at most 2 decimals, dropping trailing zeros", () => {
    expect(formatPercentage({ kind: "of", percent: 33.333, base: 90, currency: "" })).toBe("33.333% of 90 is 30.");
    expect(formatPercentage({ kind: "of", percent: 12.5, base: 33, currency: "" })).toBe("12.5% of 33 is 4.13.");
  });
});
