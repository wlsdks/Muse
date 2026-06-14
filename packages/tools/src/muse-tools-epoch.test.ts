import { describe, expect, it } from "vitest";

import { createEpochConvertTool, epochToIso, isoToEpoch } from "./muse-tools-epoch.js";

describe("epochToIso (Unix timestamp → UTC ISO, auto sec/ms)", () => {
  it("treats a ≤11-digit value as seconds and a ≥1e12 value as milliseconds (same instant)", () => {
    expect(epochToIso(1718000000)).toMatchObject({ iso: "2024-06-10T06:13:20.000Z", unit: "seconds" });
    expect(epochToIso(1718000000000)).toMatchObject({ iso: "2024-06-10T06:13:20.000Z", unit: "milliseconds" });
  });

  it("normalizes to both epochSeconds and epochMillis regardless of input unit", () => {
    expect(epochToIso(1600000000)).toEqual({ iso: "2020-09-13T12:26:40.000Z", epochSeconds: 1600000000, epochMillis: 1600000000000, unit: "seconds" });
  });

  it("handles the epoch zero and pre-1970 negatives", () => {
    expect(epochToIso(0)).toMatchObject({ iso: "1970-01-01T00:00:00.000Z" });
    expect(epochToIso(-86400)).toMatchObject({ iso: "1969-12-31T00:00:00.000Z" });
  });

  it("returns undefined for a non-finite input", () => {
    expect(epochToIso(Number.NaN)).toBeUndefined();
  });
});

describe("isoToEpoch (calendar date → Unix timestamp)", () => {
  it("returns both seconds and millis for an ISO timestamp", () => {
    expect(isoToEpoch("2026-06-14T12:00:00Z")).toEqual({ iso: "2026-06-14T12:00:00.000Z", epochSeconds: 1781438400, epochMillis: 1781438400000 });
    expect(isoToEpoch("1970-01-01T00:00:00Z")).toMatchObject({ epochSeconds: 0, epochMillis: 0 });
  });

  it("returns undefined for an unparseable date", () => {
    expect(isoToEpoch("not-a-date")).toBeUndefined();
  });
});

describe("createEpochConvertTool", () => {
  it("is a read tool named epoch_convert", () => {
    const tool = createEpochConvertTool();
    expect(tool.definition.name).toBe("epoch_convert");
    expect(tool.definition.risk).toBe("read");
  });

  it("converts an epoch number (or numeric string) to a date", () => {
    const tool = createEpochConvertTool();
    expect(tool.execute({ value: 1600000000 }, { runId: "r", userId: "u" })).toMatchObject({ iso: "2020-09-13T12:26:40.000Z", unit: "seconds" });
    expect(tool.execute({ value: "1600000000" }, { runId: "r", userId: "u" })).toMatchObject({ iso: "2020-09-13T12:26:40.000Z" });
  });

  it("converts a date string to an epoch (the other direction)", () => {
    const out = createEpochConvertTool().execute({ value: "2026-06-14T12:00:00Z" }, { runId: "r", userId: "u" }) as { epochSeconds: number };
    expect(out.epochSeconds).toBe(1781438400);
  });

  it("returns an error (never throws) for unparseable input", () => {
    expect(createEpochConvertTool().execute({ value: "totally not a date or number" }, { runId: "r", userId: "u" })).toHaveProperty("error");
  });
});
