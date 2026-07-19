import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RECALL_FRESHNESS_DATASET } from "./eval-recall-freshness-ablation.mjs";
import {
  BURNED_V4_ORIGINAL_DATASET_SHA256,
  BURNED_V4_REPLAY_DATASET,
  validateBurnedV4ReplayDataset
} from "./replay-recall-conflict-aware-p0-burned-v4-dataset.mjs";
import {
  BURNED_V2_DATASET_SHA256,
  BURNED_V2_NORMALIZED_HASH_COUNT,
  BURNED_V2_NORMALIZED_HASHES_BASE64
} from "./replay-recall-conflict-aware-p0-burned-v4-burned-v2-fingerprint.mjs";
import {
  BURNED_V3_DATASET_SHA256,
  BURNED_V3_NORMALIZED_HASH_COUNT,
  BURNED_V3_NORMALIZED_HASHES_BASE64
} from "./replay-recall-conflict-aware-p0-burned-v4-burned-v3-fingerprint.mjs";
import {
  RECALL_CONFLICT_DEV_MATRIX_ITEM_COUNT,
  RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASH_COUNT,
  RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASHES_BASE64,
  RECALL_CONFLICT_DEV_MATRIX_SHA256
} from "./replay-recall-conflict-aware-p0-burned-v4-dev-matrix-fingerprint.mjs";
import {
  ARMS,
  CHILD_TIMEOUT_MS,
  DIAGNOSTICS_ROOT_RELATIVE,
  PARENT_TIMEOUT_MS,
  RERANK_TIMEOUT_MS,
  SOURCE_FREEZE_COMMIT,
  buildDiagnosticResult,
  canonicalJson,
  nearestRank,
  scorePrepared,
  sha256,
  validateDiagnosticResult
} from "./replay-recall-conflict-aware-p0-burned-v4.mjs";

const marker = (text) => /used to|no longer|이전에|지금은 아니/iu.test(text);

test("burned v4 diagnostic replay is closed, balanced, non-held-out, and byte-disjoint from v1, v2/v3, and the fixed dev matrix", () => {
  const dataset = validateBurnedV4ReplayDataset(BURNED_V4_REPLAY_DATASET, RECALL_FRESHNESS_DATASET, marker);
  assert.equal(dataset.datasetVersion, "muse-recall-burned-v4-diagnostic-replay.v1");
  assert.equal(dataset.dataOrigin, "synthetic burned v4 diagnostic replay");
  assert.equal(dataset.heldOut, false);
  assert.equal(dataset.organicEvidence, false);
  assert.equal(dataset.qualificationStatus, "NOT_QUALIFIED");
  assert.equal(dataset.sourceFreezeCommit, "4a1f046bce0cfb7762072137c83f438e34540f38");
  assert.match(BURNED_V2_DATASET_SHA256, /^[a-f0-9]{64}$/u);
  assert.equal(BURNED_V2_NORMALIZED_HASH_COUNT, 280);
  assert.equal(Buffer.from(BURNED_V2_NORMALIZED_HASHES_BASE64, "base64").length, 280 * 32);
  assert.equal(BURNED_V3_DATASET_SHA256, "2e2272b46b4745ac5e3754b6ef6b256dcb8dcfeebe940a6781fa0263bc2534f6");
  assert.equal(BURNED_V3_NORMALIZED_HASH_COUNT, 280);
  assert.equal(Buffer.from(BURNED_V3_NORMALIZED_HASHES_BASE64, "base64").length, 280 * 32);
  assert.notEqual(BURNED_V2_NORMALIZED_HASHES_BASE64, BURNED_V3_NORMALIZED_HASHES_BASE64);
  assert.equal(RECALL_CONFLICT_DEV_MATRIX_SHA256, "ddbcc0e24f0e60ac48d166994a21ccd1004ae086c7bd4793a5f100bc3fc00c75");
  assert.equal(RECALL_CONFLICT_DEV_MATRIX_ITEM_COUNT, 32);
  assert.equal(RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASH_COUNT, 160);
  const devSource = readFileSync(new URL("./dev-recall-conflict-pair-matrix.ts", import.meta.url), "utf8");
  const values = []; const itemPattern = /\{ id: "([^"]+)", locale: "(?:EN|KO)", query: "([^"]+)", current: "([^"]+)", stale: "([^"]+)", distractor: "([^"]+)" \}/gu; let match;
  while ((match = itemPattern.exec(devSource))) values.push(...match.slice(1));
  const normalized = values.map((value) => value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim());
  assert.equal(values.length, RECALL_CONFLICT_DEV_MATRIX_ITEM_COUNT * 5);
  assert.equal(createHash("sha256").update([...normalized].sort().join("\n")).digest("hex"), RECALL_CONFLICT_DEV_MATRIX_SHA256);
  const hashes = normalized.map((value) => createHash("sha256").update(value).digest()).sort(Buffer.compare);
  assert.equal(Buffer.concat(hashes).toString("base64"), RECALL_CONFLICT_DEV_MATRIX_NORMALIZED_HASHES_BASE64);
  assert.equal(BURNED_V4_ORIGINAL_DATASET_SHA256, "28f5bad8e4245f1932be2beabcb0a04b9fb2ca411c42682b237ee9831f45dcf7");
  assert.equal(dataset.cases.length, 64);
  assert.equal(dataset.cases.filter((item) => item.category === "correction-pair" && item.locale === "ko").length, 24);
  assert.equal(dataset.cases.filter((item) => item.category === "correction-pair" && item.locale === "en").length, 24);
  assert.equal(dataset.cases.filter((item) => item.category === "absent").length, 8);
  assert.equal(dataset.cases.filter((item) => item.category === "ordinary-positive").length, 8);
  assert.equal(new Set(dataset.cases.map((item) => item.topicId)).size, 64);

  const duplicateTopic = structuredClone(dataset);
  duplicateTopic.cases[1].topicId = duplicateTopic.cases[0].topicId;
  assert.throws(() => validateBurnedV4ReplayDataset(duplicateTopic, RECALL_FRESHNESS_DATASET, marker), /topicId/);

  const overlap = structuredClone(dataset);
  overlap.cases[0].query = RECALL_FRESHNESS_DATASET.cases[0].query.normalize("NFKC").toUpperCase();
  assert.throws(() => validateBurnedV4ReplayDataset(overlap, RECALL_FRESHNESS_DATASET, marker), /v1 overlap/);

  const devOverlap = structuredClone(dataset);
  devOverlap.cases[0].query = "WHAT IS THE CERAMIC KILN VENT SETTING?";
  assert.throws(() => validateBurnedV4ReplayDataset(devOverlap, RECALL_FRESHNESS_DATASET, marker), /development matrix overlap/);

  const noMarker = structuredClone(dataset);
  const stale = noMarker.corpus.find((item) => item.source === noMarker.cases[0].staleSource);
  stale.text = "This superseded setting is intentionally missing a stale marker.";
  assert.throws(() => validateBurnedV4ReplayDataset(noMarker, RECALL_FRESHNESS_DATASET, marker), /stale marker/);
});

test("burned v4 replay has no generic eval command or tracked artifact promotion path", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const runnerSource = readFileSync(new URL("./replay-recall-conflict-aware-p0-burned-v4.mjs", import.meta.url), "utf8");
  assert.equal(packageJson.scripts["eval:recall-conflict-aware-p0"], undefined);
  assert.equal(packageJson.scripts["eval:recall-conflict-aware-p0:validate"], undefined);
  assert.match(packageJson.scripts["replay:recall-conflict-aware-p0-burned-v4"], /replay-recall-conflict-aware-p0-burned-v4\.mjs/u);
  assert.doesNotMatch(runnerSource, /docs\/benchmarks|writeArtifacts|validateArtifacts|--validate/iu);
});

test("conflict-aware result closes accounting, pass2 hashes, gates, and timeouts", () => {
  assert.equal(PARENT_TIMEOUT_MS, 25 * 60_000);
  assert.equal(CHILD_TIMEOUT_MS, 6 * 60_000);
  assert.equal(RERANK_TIMEOUT_MS, 4_000);
  assert.deepEqual(ARMS, ["A", "B"]);
  assert.equal(nearestRank([1, 2, 3, 4], 0.95), 4);
  const correction = BURNED_V4_REPLAY_DATASET.cases.find((item) => item.category === "correction-pair");
  const prepared = { scored: [{ file: "/x/current" }, { file: "/x/stale" }], systemPrompt: "p", verdict: "confident" };
  assert.deepEqual(scorePrepared(correction, prepared, (file) => file.endsWith("current") ? correction.currentSource : correction.staleSource), {
    absentAbstain: false, currentTop1: true, ok: true, ordinaryTop1: false, pairRecall: true, reasonCode: null
  });
  const modelTags = ["nomic-embed-text", "nomic-embed-text-v2-moe", "embeddinggemma", "qwen3-embedding:0.6b"];
  const models = modelTags.map((modelTag) => ({
    digest: "a".repeat(64), dimension: 768, modelTag, ollamaVersion: "test", resolvedTag: `${modelTag}:latest`,
    trials: [1, 2].map((trial) => ({
      arms: Object.fromEntries(ARMS.map((arm) => [arm, {
        latencyMs: Array(64).fill(arm === "A" ? 10 : 20),
        outcomes: BURNED_V4_REPLAY_DATASET.cases.map((item, caseIndex) => ({
          absentAbstain: item.category === "absent" && caseIndex !== 63, arm, caseId: item.caseId, category: item.category,
          currentTop1: arm === "B" && item.category === "correction-pair", locale: item.locale, ok: true,
          ordinaryTop1: item.category === "ordinary-positive", pairRecall: arm === "B" && item.category === "correction-pair",
          promptBytes: 100, reasonCode: null, rerankDecision: arm === "A"
            ? { eligible: false, httpAttempts: 0, logicalInvocations: 0, outcome: "absent" }
            : caseIndex === 0
              ? { eligible: true, httpAttempts: 1, logicalInvocations: 1, outcome: "success" }
              : { eligible: false, httpAttempts: 0, logicalInvocations: 0, outcome: "ineligible-window" },
          rerankerLatencyMs: arm === "B" && caseIndex === 0 ? 5 : 0
        })),
      }])), modelTag, trial
    })), warmup: { afterIndex: true, embeddingRequests: 1, httpAttempts: 1, outcome: "success" }
  }));
  const result = buildDiagnosticResult({ models, ownerState: { afterSha256: "b".repeat(64), beforeSha256: "b".repeat(64), unchanged: true }, reranker: { digest: "c".repeat(64), modelTag: "qwen3:8b", resolvedTag: "qwen3:8b" }, runMetadata: { generatedAt: "2026-07-19T00:00:00.000Z", node: "test", platform: "test" } });
  assert.equal(result.payload.dataset.sourceFreezeCommit, SOURCE_FREEZE_COMMIT);
  assert.equal(result.payload.dataset.heldOut, false);
  assert.equal(result.payload.dataset.qualificationStatus, "NOT_QUALIFIED");
  assert.equal(DIAGNOSTICS_ROOT_RELATIVE, ".muse-dev/evals/recall-conflict-aware-p0-burned-v4-replay");
  assert.equal(validateDiagnosticResult(result).payload.qualification.qualified, false);
  assert.equal(result.payload.qualification.status, "NOT_QUALIFIED");
  assert.equal(result.payload.qualification.reason, "BURNED_V4_DIAGNOSTIC_REPLAY");
  assert.equal(result.payload.qualification.gates.absent, true);
  assert.equal(result.payload.absoluteChecks.absentBaselineFloor.passed, false);
  assert.deepEqual(result.payload.claimLimitations, ["ABSENT_BASELINE_FLOOR_NOT_MET"]);
  assert.equal(result.payload.models.every((model) => model.arms.B.eligibilityByLocale.some((item) => item.eligible === 0)), true);
  const forged = structuredClone(result);
  forged.payload.accounting.rerankerHttpAttemptsB -= 1;
  forged.payloadHash = sha256(`${canonicalJson(forged.payload)}\n`);
  assert.throws(() => validateDiagnosticResult(forged), /accounting/);
});
