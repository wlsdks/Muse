import { describe, expect, it } from "vitest";

import {
  analyzeApprovalRates,
  RUBBER_STAMP_APPROVAL_RATE_THRESHOLD,
  RUBBER_STAMP_MIN_SAMPLE_SIZE
} from "../src/approval-rate-analysis.js";

type Result = "performed" | "refused" | "failed";

function entries(gateClass: string, results: readonly Result[]): { readonly gateClass: string; readonly result: Result }[] {
  return results.map((result) => ({ gateClass, result }));
}

describe("analyzeApprovalRates", () => {
  it("flags a big, heavily-approved class as a rubber stamp", () => {
    const allApproved = entries("web_action", Array(RUBBER_STAMP_MIN_SAMPLE_SIZE).fill("performed") as Result[]);
    const summary = analyzeApprovalRates(allApproved);
    expect(summary.gates).toHaveLength(1);
    const gate = summary.gates[0]!;
    expect(gate.gateClass).toBe("web_action");
    expect(gate.prompted).toBe(RUBBER_STAMP_MIN_SAMPLE_SIZE);
    expect(gate.approved).toBe(RUBBER_STAMP_MIN_SAMPLE_SIZE);
    expect(gate.denied).toBe(0);
    expect(gate.approvalRate).toBe(1);
    expect(gate.rubberStamped).toBe(true);
    expect(summary.rubberStampedClasses).toEqual(["web_action"]);
  });

  it("does NOT flag a mixed class even with a large sample", () => {
    // 15 approved / 10 denied — well above the sample floor but far below the threshold.
    const mixed = entries("email_send", [
      ...(Array(15).fill("performed") as Result[]),
      ...(Array(10).fill("refused") as Result[])
    ]);
    const summary = analyzeApprovalRates(mixed);
    const gate = summary.gates[0]!;
    expect(gate.prompted).toBe(25);
    expect(gate.approvalRate).toBeCloseTo(15 / 25, 5);
    expect(gate.approvalRate).toBeLessThan(RUBBER_STAMP_APPROVAL_RATE_THRESHOLD);
    expect(gate.rubberStamped).toBe(false);
    expect(summary.rubberStampedClasses).toEqual([]);
  });

  it("does NOT flag a 100%-approved class below the minimum sample size (2/2 is not evidence)", () => {
    const tiny = entries("home_action", ["performed", "performed"]);
    const summary = analyzeApprovalRates(tiny);
    const gate = summary.gates[0]!;
    expect(gate.prompted).toBe(2);
    expect(gate.approvalRate).toBe(1);
    expect(gate.rubberStamped).toBe(false);
    expect(summary.rubberStampedClasses).toEqual([]);
  });

  it("does NOT flag a class exactly one prompt below the minimum sample size, even at 100%", () => {
    const justBelow = entries(
      "mac_message_send",
      Array(RUBBER_STAMP_MIN_SAMPLE_SIZE - 1).fill("performed") as Result[]
    );
    const summary = analyzeApprovalRates(justBelow);
    expect(summary.gates[0]!.rubberStamped).toBe(false);
  });

  it("counts an approved-then-failed-execution outcome toward the approval rate, tracked separately as executionFailed", () => {
    const withFailures = entries("proposed_action", [
      ...(Array(18).fill("performed") as Result[]),
      "failed",
      "failed"
    ]);
    const summary = analyzeApprovalRates(withFailures);
    const gate = summary.gates[0]!;
    expect(gate.prompted).toBe(20);
    expect(gate.approved).toBe(20);
    expect(gate.executionFailed).toBe(2);
    expect(gate.denied).toBe(0);
    expect(gate.approvalRate).toBe(1);
    expect(gate.rubberStamped).toBe(true);
  });

  it("skips entries with no gateClass — legacy / non-interactive entries never join a bucket", () => {
    const mixed = [
      { gateClass: undefined, result: "performed" as Result },
      { gateClass: "web_action", result: "performed" as Result }
    ];
    const summary = analyzeApprovalRates(mixed);
    expect(summary.gates).toHaveLength(1);
    expect(summary.gates[0]!.gateClass).toBe("web_action");
    expect(summary.gates[0]!.prompted).toBe(1);
  });

  it("groups multiple gate classes independently and sorts busiest first", () => {
    const combined = [
      ...entries("email_send", ["performed", "performed", "refused"]),
      ...entries("web_action", Array(RUBBER_STAMP_MIN_SAMPLE_SIZE).fill("performed") as Result[])
    ];
    const summary = analyzeApprovalRates(combined);
    expect(summary.gates.map((g) => g.gateClass)).toEqual(["web_action", "email_send"]);
    expect(summary.rubberStampedClasses).toEqual(["web_action"]);
  });

  it("returns an empty summary for no entries", () => {
    const summary = analyzeApprovalRates([]);
    expect(summary.gates).toEqual([]);
    expect(summary.rubberStampedClasses).toEqual([]);
  });
});
