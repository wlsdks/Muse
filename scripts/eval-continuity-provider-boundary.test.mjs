import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicSurfaceSignatures,
  detectRequiredMutants,
  validateContinuityProviderBoundaryArtifact
} from "./eval-continuity-provider-boundary.mjs";

test("public-surface matrix enumerates all 126 semantic signatures exactly once", () => {
  const signatures = buildPublicSurfaceSignatures();
  assert.equal(signatures.length, 126);
  assert.equal(new Set(signatures).size, 126);
  assert.ok(signatures.includes("mismatch-provider|mcp-resource|late|open"));
  assert.ok(signatures.includes("undefined|local-note|middle|preview"));
});

test("shared scoring seam kills identity, unavailable, and display counterfactual mutants", () => {
  assert.deepEqual(detectRequiredMutants(), {
    displayCoupling: true,
    identityBlind: true,
    unavailableLaundering: true
  });
});

test("artifact validator rejects coverage loss, low or non-conserving bins, duplicate-only stress, laundering, and insensitive mutants", () => {
  const publicSignatures = buildPublicSurfaceSignatures();
  const artifact = {
    classification: "synthetic-generated",
    controlDrift: 0,
    coreBins: {
      fault: { exact: 100, undefined: 100, throw: 100, "mismatch-id": 100, "mismatch-type": 100, "mismatch-provider": 100, "mismatch-role": 100 },
      position: { first: 200, middle: 200, late: 300 },
      provider: { "local-task": 200, "local-note": 200, "mcp-resource": 300 }
    },
    coreCasesProcessed: 700,
    duplicateCoreSignatures: 637,
    evidenceLaundering: 0,
    mismatchOmissions: 0,
    mutantSensitivity: { displayCoupling: true, identityBlind: true, unavailableLaundering: true },
    naturalProductEvidence: false,
    oracleMismatches: 0,
    permissionExpansion: false,
    persistedToProductAttunement: false,
    publicSurfaceFailures: 0,
    publicSurfaceSignatures: publicSignatures,
    schema: "muse.continuity-provider-boundary-synthetic/v1",
    seed: 0x43504231,
    syntheticFilesPersisted: true,
    uniqueCoreSignatures: 63
  };

  assert.equal(validateContinuityProviderBoundaryArtifact(artifact, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), artifact);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, publicSurfaceSignatures: publicSignatures.slice(1) }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /126 semantic signatures/iu);
  const { throw: _missingThrowBin, ...missingFaultBin } = artifact.coreBins.fault;
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, coreBins: { ...artifact.coreBins, fault: missingFaultBin } }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /fault bin minimum/iu);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, coreBins: { ...artifact.coreBins, fault: { ...artifact.coreBins.fault, exact: 99 } } }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /fault bin minimum/iu);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, coreBins: { ...artifact.coreBins, fault: { ...artifact.coreBins.fault, exact: 101 } } }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /fault bin counts must sum to 700/iu);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, coreBins: { ...artifact.coreBins, position: { ...artifact.coreBins.position, first: 201 } } }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /position bin counts must sum to 700/iu);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, coreBins: { ...artifact.coreBins, provider: { ...artifact.coreBins.provider, "local-task": 201 } } }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /provider bin counts must sum to 700/iu);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, uniqueCoreSignatures: 1, duplicateCoreSignatures: 699 }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /duplicate-only/iu);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, evidenceLaundering: 1 }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /laundering/iu);
  assert.throws(() => validateContinuityProviderBoundaryArtifact({ ...artifact, mutantSensitivity: { ...artifact.mutantSensitivity, identityBlind: false } }, { coreCases: 700, minFaultBin: 100, minPositionBin: 200, minProviderBin: 200 }), /mutant sensitivity/iu);
});
