import { describe, expect, it } from "vitest";

import { readInterruptionBudgetStatus } from "./interruption-gate.js";

import type { InterruptionDeliveryEntry } from "@muse/stores";

const NOW = new Date("2026-07-17T12:00:00.000Z");

function deliveryAt(isoOffsetMinutesFromNow: number, source = "pattern-firing"): InterruptionDeliveryEntry {
  return { at: new Date(NOW.getTime() + isoOffsetMinutesFromNow * 60_000).toISOString(), source };
}

describe("readInterruptionBudgetStatus", () => {
  it("an empty ledger reports 0 used against the configured caps, never mutating the input", () => {
    const entries: readonly InterruptionDeliveryEntry[] = [];
    const status = readInterruptionBudgetStatus(entries, { dailyCap: 6, hourlyCap: 2 }, NOW);
    expect(status).toEqual({ dayCap: 6, dayUsed: 0, hourCap: 2, hourUsed: 0 });
    expect(entries).toHaveLength(0);
  });

  it("counts a delivery inside the trailing 60-minute window, excludes one just outside it", () => {
    const entries = [
      deliveryAt(-30), // 30 min ago — inside the hour window
      deliveryAt(-61) // 61 min ago — outside the hour window
    ];
    const status = readInterruptionBudgetStatus(entries, { dailyCap: 6, hourlyCap: 2 }, NOW);
    expect(status.hourUsed).toBe(1);
  });

  it("a delivery exactly at the window boundary (now - 60min) is excluded (strict >)", () => {
    const entries = [deliveryAt(-60)];
    const status = readInterruptionBudgetStatus(entries, { dailyCap: 6, hourlyCap: 2 }, NOW);
    expect(status.hourUsed).toBe(0);
  });

  it("a delivery at exactly `now` is included (inclusive <=)", () => {
    const entries = [deliveryAt(0)];
    const status = readInterruptionBudgetStatus(entries, { dailyCap: 6, hourlyCap: 2 }, NOW);
    expect(status.hourUsed).toBe(1);
  });

  it("a delivery timestamped in the future (after `now`) is excluded from both windows", () => {
    const entries = [deliveryAt(10)];
    const status = readInterruptionBudgetStatus(entries, { dailyCap: 6, hourlyCap: 2 }, NOW);
    expect(status.hourUsed).toBe(0);
    expect(status.dayUsed).toBe(0);
  });

  it("counts within the trailing 24-hour day window and excludes entries older than 24h", () => {
    const entries = [
      deliveryAt(-6 * 60), // 6h ago — inside day window, outside hour window
      deliveryAt(-25 * 60) // 25h ago — outside day window
    ];
    const status = readInterruptionBudgetStatus(entries, { dailyCap: 6, hourlyCap: 2 }, NOW);
    expect(status.hourUsed).toBe(0);
    expect(status.dayUsed).toBe(1);
  });

  it("counts every delivery in the day window independent of the hour window (both windows are independent, not nested)", () => {
    const entries = [deliveryAt(-30), deliveryAt(-6 * 60), deliveryAt(-20 * 60)];
    const status = readInterruptionBudgetStatus(entries, { dailyCap: 10, hourlyCap: 5 }, NOW);
    expect(status.hourUsed).toBe(1);
    expect(status.dayUsed).toBe(3);
  });

  it("passes the caps straight through untouched, including a 0 (unlimited) cap", () => {
    const status = readInterruptionBudgetStatus([], { dailyCap: 0, hourlyCap: 0 }, NOW);
    expect(status).toEqual({ dayCap: 0, dayUsed: 0, hourCap: 0, hourUsed: 0 });
  });
});
