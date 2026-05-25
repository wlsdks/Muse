import { describe, expect, it } from "vitest";

import { extractTraceTailEvents, resolveTraceTailIntervalMs, resolveTraceTailLimit } from "./commands-traces.js";

describe("resolveTraceTailIntervalMs", () => {
  it("defaults to 2000ms for missing / non-numeric / non-positive", () => {
    expect(resolveTraceTailIntervalMs(undefined)).toBe(2000);
    expect(resolveTraceTailIntervalMs("abc")).toBe(2000);
    expect(resolveTraceTailIntervalMs("0")).toBe(2000);
    expect(resolveTraceTailIntervalMs("-5")).toBe(2000);
  });
  it("converts seconds to ms, clamped to [1s, 60s]", () => {
    expect(resolveTraceTailIntervalMs("5")).toBe(5000);
    expect(resolveTraceTailIntervalMs("0.5")).toBe(1000); // floor-clamp to 1s
    expect(resolveTraceTailIntervalMs("120")).toBe(60000); // ceil-clamp to 60s
  });
});

describe("resolveTraceTailLimit", () => {
  it("defaults to 20 for missing / non-numeric / non-positive", () => {
    expect(resolveTraceTailLimit(undefined)).toBe(20);
    expect(resolveTraceTailLimit("nope")).toBe(20);
    expect(resolveTraceTailLimit("0")).toBe(20);
  });
  it("clamps a valid limit to [1, 200]", () => {
    expect(resolveTraceTailLimit("50")).toBe(50);
    expect(resolveTraceTailLimit("999")).toBe(200);
    expect(resolveTraceTailLimit("1")).toBe(1);
  });
});

describe("extractTraceTailEvents", () => {
  it("returns a top-level array of objects, dropping non-objects", () => {
    expect(extractTraceTailEvents([{ a: 1 }, null, "x", { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it("reads the events[] or spans[] field of an object payload", () => {
    expect(extractTraceTailEvents({ events: [{ e: 1 }] })).toEqual([{ e: 1 }]);
    expect(extractTraceTailEvents({ spans: [{ s: 1 }] })).toEqual([{ s: 1 }]);
  });
  it("returns [] for anything else", () => {
    expect(extractTraceTailEvents(null)).toEqual([]);
    expect(extractTraceTailEvents({ other: 1 })).toEqual([]);
    expect(extractTraceTailEvents("string")).toEqual([]);
  });
});
