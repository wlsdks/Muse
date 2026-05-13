import { describe, expect, it } from "vitest";

import { clampInboundLimit, tryParseJson } from "./provider-helpers.js";

describe("clampInboundLimit", () => {
  it("falls back to default 20 when raw is undefined / non-finite", () => {
    expect(clampInboundLimit(undefined)).toBe(20);
    expect(clampInboundLimit(Number.NaN)).toBe(20);
    expect(clampInboundLimit(Number.POSITIVE_INFINITY)).toBe(20);
  });
  it("clamps finite values into [1, max]", () => {
    expect(clampInboundLimit(0)).toBe(1);
    expect(clampInboundLimit(-5)).toBe(1);
    expect(clampInboundLimit(50)).toBe(50);
    expect(clampInboundLimit(500)).toBe(100); // default max
    expect(clampInboundLimit(500, 30)).toBe(30); // custom max
  });
  it("truncates fractional values toward zero", () => {
    expect(clampInboundLimit(5.9)).toBe(5);
    expect(clampInboundLimit(1.4)).toBe(1);
  });
});

describe("tryParseJson", () => {
  it("returns the parsed value for valid JSON", () => {
    expect(tryParseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });
  it("returns undefined for empty body", () => {
    expect(tryParseJson("")).toBeUndefined();
  });
  it("returns undefined for invalid JSON (no throw)", () => {
    expect(tryParseJson("not json")).toBeUndefined();
    expect(tryParseJson("{unbalanced")).toBeUndefined();
  });
});
