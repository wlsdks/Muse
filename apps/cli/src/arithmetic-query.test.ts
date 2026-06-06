import { describe, expect, it } from "vitest";

import { detectArithmeticQuery, formatArithmeticResult } from "./arithmetic-query.js";

describe("detectArithmeticQuery — only a PURE calculation short-circuits `muse ask`", () => {
  it("extracts the expression from a framed arithmetic question", () => {
    expect(detectArithmeticQuery("what is 1847 * 2963?")).toBe("1847 * 2963");
    expect(detectArithmeticQuery("What's 2+2")).toBe("2+2");
    expect(detectArithmeticQuery("calculate (1200 + 850) / 2")).toBe("(1200 + 850) / 2");
    expect(detectArithmeticQuery("compute 840000 * 0.18")).toBe("840000 * 0.18");
    expect(detectArithmeticQuery("how much is 15% * 200")).toBe("15% * 200");
    expect(detectArithmeticQuery("  12 / 4 =  ")).toBe("12 / 4"); // trailing "=" and spaces stripped
  });

  it("normalizes natural-language operators (EN + KO) to symbols so spelled-out math also short-circuits", () => {
    expect(detectArithmeticQuery("what is 12 times 4?")).toBe("12 * 4");
    expect(detectArithmeticQuery("13 multiplied by 7")).toBe("13 * 7");
    expect(detectArithmeticQuery("20 minus 5")).toBe("20 - 5");
    expect(detectArithmeticQuery("100 divided by 4")).toBe("100 / 4");
    expect(detectArithmeticQuery("8 plus 9")).toBe("8 + 9");
    expect(detectArithmeticQuery("17 곱하기 6은?")).toBe("17 * 6"); // KO operator + trailing topic particle
    expect(detectArithmeticQuery("100 나누기 4")).toBe("100 / 4");
  });

  it("does NOT treat a sentence that merely contains an operator word as math", () => {
    expect(detectArithmeticQuery("what did Sarah say about it 5 times?")).toBeNull();
    expect(detectArithmeticQuery("나는 운동을 곱하기 좋아해")).toBeNull(); // letters remain → not pure math
  });

  it("returns null for a real NOTES question (never hijacks retrieval)", () => {
    expect(detectArithmeticQuery("what is my Q3 budget?")).toBeNull();
    expect(detectArithmeticQuery("what's the launch date?")).toBeNull();
    expect(detectArithmeticQuery("calculate the risk for the project")).toBeNull(); // has letters
    expect(detectArithmeticQuery("what did Sarah say about 5 * 3?")).toBeNull();
  });

  it("returns null for a bare number or lone sign (not a calculation)", () => {
    expect(detectArithmeticQuery("what is 42?")).toBeNull(); // no operator
    expect(detectArithmeticQuery("-5")).toBeNull(); // lone negative, no binary op
    expect(detectArithmeticQuery("3.14")).toBeNull();
    expect(detectArithmeticQuery("")).toBeNull();
  });

  it("rejects an over-long expression (256-char guard)", () => {
    expect(detectArithmeticQuery(`1+${"1+".repeat(200)}1`)).toBeNull();
  });
});

describe("formatArithmeticResult — exact answer, grouped for readability", () => {
  it("groups an integer result with thousands separators", () => {
    expect(formatArithmeticResult("1847 * 2963", 5_472_661)).toBe("1847 * 2963 = 5,472,661");
  });

  it("shows a fractional result without trailing-zero noise", () => {
    expect(formatArithmeticResult("840000 * 0.18", 151_200)).toBe("840000 * 0.18 = 151,200");
    expect(formatArithmeticResult("1 / 8", 0.125)).toBe("1 / 8 = 0.125");
  });
});
