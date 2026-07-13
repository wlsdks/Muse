import type { ContinuityOutcome, ContinuityPolicy, ContinuityPolicyPresentation } from "./types.js";

export const BASELINE_POLICY: ContinuityPolicyPresentation = {
  detail: "standard",
  nextStep: "direct",
  suppression: "none"
};

const POLICY_BY_OUTCOME: Readonly<Record<ContinuityOutcome, ContinuityPolicyPresentation>> = {
  adjusted: { detail: "standard", nextStep: "contextual", suppression: "none" },
  ignored: { detail: "compact", nextStep: "direct", suppression: "acknowledge-previous" },
  rejected: { detail: "compact", nextStep: "hidden", suppression: "acknowledge-previous" },
  used: { detail: "compact", nextStep: "direct", suppression: "none" }
};

/**
 * Deterministic and intentionally narrow: outcomes can only choose one of the
 * reviewed display policies. The reducer neither sees nor can mutate sources,
 * retention, permissions, recipients, schedules, or any external action.
 */
export function policyForOutcome(outcome: ContinuityOutcome, version: number): ContinuityPolicy {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("policy version must be a non-negative safe integer");
  }
  return { ...POLICY_BY_OUTCOME[outcome], version };
}

export function baselinePolicy(version = 0): ContinuityPolicy {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("policy version must be a non-negative safe integer");
  }
  return { ...BASELINE_POLICY, version };
}

export function isBaselinePolicy(policy: ContinuityPolicy): boolean {
  return policy.detail === BASELINE_POLICY.detail
    && policy.nextStep === BASELINE_POLICY.nextStep
    && policy.suppression === BASELINE_POLICY.suppression;
}
