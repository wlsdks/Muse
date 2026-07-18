import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContinuityShadowCorpusPlan,
  validateContinuityInteractionShadowArtifact
} from "./dogfood-continuity-interactions.mjs";

function slice(total, perState, samples) {
  return {
    completionLatencyMs: { maxMs: samples ? 20 : null, medianMs: samples ? 10 : null, minMs: samples ? 5 : null, p95Ms: samples ? 20 : null, sampleSize: samples },
    states: {
      exact: { count: perState, ratio: 1 / 3 },
      none: { count: perState, ratio: 1 / 3 },
      unavailable: { count: perState, ratio: 1 / 3 }
    },
    totalDeliveries: total
  };
}

test("shadow corpus plan fixes four cases in every life/work by state cell", () => {
  const plan = buildContinuityShadowCorpusPlan();
  assert.equal(plan.length, 24);
  for (const kind of ["life", "work"]) {
    for (const state of ["exact", "none", "unavailable"]) {
      assert.equal(plan.filter((entry) => entry.threadKind === kind && entry.expectedState === state).length, 4);
    }
  }
});

test("shadow artifact validator accepts the fixed controlled matrix and rejects outcome contamination", () => {
  const artifact = {
    classification: "controlled-same-session",
    corpus: { casesPerCell: 4, deliveries: 24 },
    digest: {
      byThreadKind: { life: slice(12, 4, 4), work: slice(12, 4, 4) },
      overall: slice(24, 8, 8)
    },
    invariants: {
      explicitOutcomes: 0,
      interactionReceipts: 8,
      ownerOnlyFiles: true,
      permissionOrGrantFields: 0,
      readOnlyReportBytesUnchanged: true,
      replayReceiptCountUnchanged: true
    },
    naturalLongitudinalEvidence: false,
    schema: "muse.continuity-interaction-shadow/v1"
  };
  assert.equal(validateContinuityInteractionShadowArtifact(artifact), artifact);
  assert.throws(() => validateContinuityInteractionShadowArtifact({
    ...artifact,
    invariants: { ...artifact.invariants, explicitOutcomes: 1 }
  }), /must not create outcomes/iu);
  assert.throws(() => validateContinuityInteractionShadowArtifact({
    ...artifact,
    digest: {
      ...artifact.digest,
      overall: {
        ...artifact.digest.overall,
        states: {
          ...artifact.digest.overall.states,
          exact: { ...artifact.digest.overall.states.exact, ratio: 0.5 }
        }
      }
    }
  }), /ratios do not match/iu);
});
