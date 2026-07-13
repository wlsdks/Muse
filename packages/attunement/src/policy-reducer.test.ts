import { describe, expect, it } from "vitest";

import { BASELINE_POLICY, policyForOutcome, type ContinuityOutcome } from "./index.js";

describe("Personal Continuity policy reducer", () => {
  it("maps exactly the four canonical outcomes to the reviewed display-only policies", () => {
    const expected: Readonly<Record<ContinuityOutcome, Omit<ReturnType<typeof policyForOutcome>, "version">>> = {
      adjusted: { detail: "standard", nextStep: "contextual", suppression: "none" },
      ignored: { detail: "compact", nextStep: "direct", suppression: "acknowledge-previous" },
      rejected: { detail: "compact", nextStep: "hidden", suppression: "acknowledge-previous" },
      used: { detail: "compact", nextStep: "direct", suppression: "none" }
    };
    for (const [outcome, policy] of Object.entries(expected) as Array<[ContinuityOutcome, typeof expected[ContinuityOutcome]]>) {
      expect(policyForOutcome(outcome, 7)).toEqual({ ...policy, version: 7 });
    }
    expect(BASELINE_POLICY).toEqual({ detail: "standard", nextStep: "direct", suppression: "none" });
  });

  it("refuses invalid policy version input instead of silently constructing a malformed policy", () => {
    expect(() => policyForOutcome("used", -1)).toThrow("non-negative safe integer");
  });
});
