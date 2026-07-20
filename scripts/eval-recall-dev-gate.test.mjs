import assert from "node:assert/strict";
import { test } from "node:test";

import { RECALL_FRESHNESS_DATASET } from "./eval-recall-freshness-ablation.mjs";
import {
  DEV_GATE_REPEAT,
  aggregateStrictPassK,
  devGateFailureCode,
  scoreDevRecallCase,
  validateDevNetworkAccounting
} from "./eval-recall-dev-gate.mjs";

const prepared = (verdict, sources) => ({
  scored: sources.map((file, chunkIndex) => ({ chunk: { chunkIndex, embedding: [1], text: file }, file, score: 1 })),
  verdict
});
const sourceForFile = (file) => file;

test("visible dev dataset has fixed 20/20/20 denominators", () => {
  const counts = Object.groupBy(RECALL_FRESHNESS_DATASET.cases, (item) => item.category);
  assert.equal(counts["ordinary-positive"].length, 20);
  assert.equal(counts.absent.length, 20);
  assert.equal(counts["correction-pair"].length, 20);
});

test("objective scorer separates ordinary confidence, absent abstention, and exact current-before-stale", () => {
  assert.equal(scoreDevRecallCase({ category: "ordinary-positive", expectedSource: "right" }, prepared("confident", ["right"]), sourceForFile).ok, true);
  assert.equal(scoreDevRecallCase({ category: "ordinary-positive", expectedSource: "right" }, prepared("ambiguous", ["right"]), sourceForFile).ok, false);
  assert.equal(scoreDevRecallCase({ category: "absent" }, prepared("none", ["distractor"]), sourceForFile).ok, true);
  assert.equal(scoreDevRecallCase({ category: "absent" }, prepared("confident", ["distractor"]), sourceForFile).ok, false);
  const correction = { category: "correction-pair", currentSource: "current", staleSource: "stale" };
  assert.deepEqual(scoreDevRecallCase(correction, prepared("confident", ["current", "stale"]), sourceForFile), {
    currentTop1: true,
    ok: true,
    pairRetained: true,
    reasonCode: null
  });
  assert.equal(scoreDevRecallCase(correction, prepared("confident", ["stale", "current"]), sourceForFile).ok, false);
  assert.equal(scoreDevRecallCase(correction, prepared("confident", ["current"]), sourceForFile).ok, false);
});

test("strict pass^3 collapses a case only when every repeat passes", () => {
  const cases = Array.from({ length: 60 }, (_unused, index) => ({
    caseId: `case-${index}`,
    category: index < 20 ? "ordinary-positive" : index < 40 ? "absent" : "correction-pair"
  }));
  const trials = Array.from({ length: DEV_GATE_REPEAT }, (_unused, repeat) => ({
    outcomes: cases.map((item, index) => ({
      caseId: item.caseId,
      category: item.category,
      currentTop1: item.category === "correction-pair",
      ok: !(repeat === 2 && index === 0),
      pairRetained: item.category === "correction-pair"
    }))
  }));
  const result = aggregateStrictPassK(trials, cases);
  assert.equal(result.ordinary.passed, 19);
  assert.equal(result.absent.passed, 20);
  assert.equal(result.correction.passed, 20);
  assert.equal(result.overall.passed, 59);
  assert.equal(result.passed, true);
  trials[2].outcomes[20].ok = false;
  assert.equal(aggregateStrictPassK(trials, cases).passed, false);
});

test("network accounting is content-blind, exact, and rejects answer or unknown traffic", () => {
  const valid = {
    answerRequests: 0,
    controlRequests: 4,
    deniedExternalRequests: 0,
    embeddingRequests: 240,
    otherLoopbackRequests: 0,
    preloadRequests: 180,
    selectorRequests: 160,
    totalLoopbackRequests: 584
  };
  assert.equal(validateDevNetworkAccounting(valid, { controlRequests: 4, embeddingRequests: 240, preloadRequests: 180, selectorRequests: 160 }), valid);
  assert.throws(() => validateDevNetworkAccounting({ ...valid, answerRequests: 1, totalLoopbackRequests: 585 }, { controlRequests: 4, embeddingRequests: 240, preloadRequests: 180, selectorRequests: 160 }));
  assert.throws(() => validateDevNetworkAccounting({ ...valid, selectorRequests: 159, totalLoopbackRequests: 583 }, { controlRequests: 4, embeddingRequests: 240, preloadRequests: 180, selectorRequests: 160 }));
});

test("failure output collapses unknown errors to a closed code", () => {
  assert.equal(devGateFailureCode(new Error("private absolute path /Users/me")), "DEV_GATE_FAILED");
});
