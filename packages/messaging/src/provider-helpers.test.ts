import { describe, expect, it } from "vitest";

import { clampInboundLimit, clampOutboundText, tryParseJson } from "./provider-helpers.js";

describe("clampOutboundText", () => {
  it("returns short text unchanged", () => {
    expect(clampOutboundText("hello", 4096)).toBe("hello");
    expect(clampOutboundText("x".repeat(4096), 4096)).toBe("x".repeat(4096));
  });

  it("truncates over-limit text with a marker, never exceeding max", () => {
    const out = clampOutboundText("y".repeat(5000), 4096);
    expect(out.length).toBe(4096);
    expect(out.endsWith("… [truncated]")).toBe(true);
    expect(out.startsWith("y")).toBe(true);
  });

  it("defaults to Telegram's 4096 cap and supports a tighter platform cap", () => {
    expect(clampOutboundText("z".repeat(5000)).length).toBe(4096);
    const discord = clampOutboundText("z".repeat(3000), 2000);
    expect(discord.length).toBe(2000);
    expect(discord.endsWith("… [truncated]")).toBe(true);
  });

  it("degrades safely when max is smaller than the marker", () => {
    expect(clampOutboundText("abcdef", 3)).toBe("abc");
    expect(clampOutboundText("abcdef", 0)).toBe("");
  });
});

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
