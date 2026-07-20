import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildReadmeEvidenceResult,
  renderQualifiedGroundingSvg,
  renderControlledScaleSvg,
  renderReadmeEvidence,
  validateReadmeEvidenceArtifacts,
  validateReadmeEvidenceResult
} from "./render-readme-qualified-evidence.mjs";

const roots = [];
test.after(async () => Promise.all(roots.map((root) => rm(root, { force: true, recursive: true }))));

test("README evidence manifest closes the exact two-chart set and qualified source numbers", async () => {
  const result = await buildReadmeEvidenceResult();
  assert.equal(validateReadmeEvidenceResult(result), result);
  assert.deepEqual(result.payload.charts.map(({ file, id, status }) => ({ file, id, status })), [
    { file: "readme-qualified-grounding-v1.svg", id: "qualified-grounding", status: "QUALIFIED_CONTROLLED_COMPONENT" },
    { file: "readme-controlled-scale-v1.svg", id: "controlled-scale", status: "QUALIFIED_CONTROLLED_SYNTHETIC_INTEGRITY" }
  ]);
  assert.deepEqual(result.payload.charts[0].checks, [
    { falseRefusal: { delta: 0, off: [0, 12], on: [0, 12] }, faithfulness: { delta: 0.94, off: [0, 17], on: [16, 17] }, id: "self-authored" },
    { falseRefusal: { delta: 0, off: [0, 8], on: [0, 8] }, faithfulness: { delta: 0.63, off: [0, 8], on: [5, 8] }, id: "squad-2.0" }
  ]);
  assert.deepEqual(result.payload.charts[1].corpora, [1_000, 10_000, 100_000, 1_000_000]);
  assert.deepEqual(result.payload.charts[1].fullCorpus, { generated: 1_111_000, parsedAndSchemaValidated: 1_111_000, serialized: 1_111_000 });
  assert.deepEqual(result.payload.charts[1].runtimeSample, { matrixCells: 96, namedPublicMuseSeams: [768, 768], terminalInvariants: [768, 768] });
  assert.deepEqual(result.payload.charts[1].calls, { llm: 0, network: 0, tool: 0 });
  assert.equal(result.payload.charts[1].ownerState, "BYTE_STABLE");
});

test("README-only SVGs are deterministic, accessible, and keep content inside measured padding", async () => {
  const root = await mkdtemp(join(tmpdir(), "muse-readme-evidence-"));
  roots.push(root);
  const paths = {
    grounding: join(root, "grounding.svg"),
    manifest: join(root, "manifest.json"),
    scale: join(root, "scale.svg")
  };
  const result = await renderReadmeEvidence(paths);
  assert.equal((await validateReadmeEvidenceArtifacts(paths)).payloadHash, result.payloadHash);
  const grounding = await readFile(paths.grounding, "utf8");
  const scale = await readFile(paths.scale, "utf8");
  assert.equal(grounding, renderQualifiedGroundingSvg(result));
  assert.equal(scale, renderControlledScaleSvg(result));
  for (const svg of [grounding, scale]) {
    assert.match(svg, /role="img" aria-labelledby="title desc"/u);
    assert.match(svg, /<title id="title">/u);
    assert.match(svg, /<desc id="desc">/u);
    assert.match(svg, /<text class="footer" x="48" y="(5\d\d|6\d\d)"/u);
    assert.doesNotMatch(svg, /x="(?:0|1200)"|y="(?:0|600|700)"/u);
  }
  assert.match(grounding, /Independent controlled checks/u);
  assert.match(grounding, /16\/17/u);
  assert.match(grounding, /5\/8/u);
  assert.match(scale, /FULL CORPUS · integrity counters/u);
  assert.match(scale, /SEPARATE 768-RECORD SAMPLE · runtime public seams/u);
  assert.match(scale, /Parsed \+ schema validated/u);
});
