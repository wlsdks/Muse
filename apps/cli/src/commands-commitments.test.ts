import type { UserCommitment } from "@muse/agent-core";
import { describe, expect, it } from "vitest";

import { buildTaskFromCommitment, clampScanLimit } from "./commands-commitments.js";

describe("commands-commitments clampScanLimit — strict-parse convention", () => {
  it("returns the fallback when absent or blank", () => {
    expect(clampScanLimit(undefined, 10, 50)).toBe(10);
    expect(clampScanLimit("   ", 10, 50)).toBe(10);
  });

  it("parses and caps a valid value", () => {
    expect(clampScanLimit("5", 10, 50)).toBe(5);
    expect(clampScanLimit("999", 10, 50)).toBe(50);
    expect(clampScanLimit("3.9", 10, 50)).toBe(3);
  });

  it("throws on an invalid value rather than silently defaulting", () => {
    expect(() => clampScanLimit("abc", 10, 50)).toThrow(/positive number/u);
    expect(() => clampScanLimit("0", 10, 50)).toThrow(/positive number/u);
    expect(() => clampScanLimit("5 items", 10, 50)).toThrow(/got '5 items'/u);
  });
});

describe("buildTaskFromCommitment — convert a scanned commitment into a tracked task", () => {
  const commitments: readonly UserCommitment[] = [
    { confidence: "high", kind: "need-to", text: "email Bob the Q3 numbers" },
    { confidence: "low", kind: "should", text: "maybe refactor the parser" }
  ];
  const idFactory = (): string => "task_fixed";
  const now = new Date("2026-06-05T09:00:00.000Z");

  it("builds an OPEN task from the Nth commitment (1-based, matching the scan list)", () => {
    expect(buildTaskFromCommitment(commitments, 1, [], idFactory, now)).toEqual({
      task: { createdAt: "2026-06-05T09:00:00.000Z", id: "task_fixed", status: "open", title: "email Bob the Q3 numbers" }
    });
    // the SECOND commitment, not the first
    expect(buildTaskFromCommitment(commitments, 2, [], idFactory, now)).toMatchObject({ task: { title: "maybe refactor the parser" } });
  });

  it("errors on an out-of-range index, naming the valid range (never throws)", () => {
    expect(buildTaskFromCommitment(commitments, 3, [], idFactory, now)).toMatchObject({ error: expect.stringContaining("1–2") });
    expect(buildTaskFromCommitment(commitments, 0, [], idFactory, now)).toMatchObject({ error: expect.stringContaining("1–2") });
  });

  it("errors (no task) when there are no commitments to track, pointing at scan", () => {
    expect(buildTaskFromCommitment([], 1, [], idFactory, now)).toMatchObject({ error: expect.stringContaining("scan") });
  });

  it("is idempotent — skips a commitment already an OPEN task (case-insensitive), so re-tracking can't duplicate", () => {
    expect(buildTaskFromCommitment(commitments, 1, ["Email Bob the Q3 Numbers"], idFactory, now))
      .toMatchObject({ error: expect.stringContaining("already tracked") });
  });
});
