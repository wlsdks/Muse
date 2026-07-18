import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProductionMatchesOracle,
  buildOffByOneBoundaryItems,
  buildOffByOneMutantAudit,
  buildSyntheticInteractionCohort,
  independentInteractionAuditOracle,
  runSyntheticInteractionAuditEvaluation,
  seededRandom,
  validateSyntheticInteractionAuditArtifact
} from "./eval-continuity-interaction-audit.mjs";

test("synthetic cohort generation is fixed-seed deterministic and outcome-neutral", () => {
  const first = buildSyntheticInteractionCohort(1, seededRandom());
  const second = buildSyntheticInteractionCohort(1, seededRandom());
  assert.deepEqual(first, second);
  assert.deepEqual(
    independentInteractionAuditOracle(first),
    independentInteractionAuditOracle(first.map(({ explicitOutcome: _outcome, ...item }) => item))
  );
});

test("independent oracle detects an off-by-one production-equivalent mutant", () => {
  const items = buildOffByOneBoundaryItems();
  assert.throws(
    () => assertProductionMatchesOracle(items, buildOffByOneMutantAudit(items)),
    /independent oracle/iu
  );
});

test("small evaluation exercises production-vs-oracle without persisting evidence", async () => {
  const artifact = await runSyntheticInteractionAuditEvaluation({ cohorts: 50, minItems: 1_000 });
  assert.equal(artifact.cohortsProcessed, 50);
  assert.ok(artifact.interactionItemsProcessed >= 1_000);
  assert.equal(artifact.oracleMismatches, 0);
  assert.equal(artifact.persistedToAttunement, false);
  assert.equal(artifact.naturalLongitudinalEvidence, false);
});

test("artifact validator rejects synthetic evidence laundering", () => {
  const artifact = {
    classification: "synthetic-generated",
    cohortsProcessed: 1,
    counterfactualOffByOneDetected: true,
    interactionItemsProcessed: 20,
    naturalLongitudinalEvidence: false,
    oracleMismatches: 0,
    outcomeContaminationMismatches: 0,
    permissionExpansion: false,
    persistedToAttunement: false,
    schema: "muse.continuity-interaction-audit-synthetic/v1",
    seed: 0x4d555345,
    statusCounts: { "audit-required": 0, collecting: 1 }
  };
  assert.equal(validateSyntheticInteractionAuditArtifact(artifact, { cohorts: 1, minItems: 20 }), artifact);
  assert.throws(
    () => validateSyntheticInteractionAuditArtifact({ ...artifact, naturalLongitudinalEvidence: true }, { cohorts: 1, minItems: 20 }),
    /must not be represented/iu
  );
});
