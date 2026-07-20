#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalJson, sha256 } from "./eval-recall-freshness-ablation.mjs";

export const README_EVIDENCE_SCHEMA_VERSION = "muse-readme-qualified-evidence.v1";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPaths = Object.freeze({
  grounding: join(repoRoot, "docs", "benchmarks", "readme-qualified-grounding-v1.svg"),
  manifest: join(repoRoot, "docs", "benchmarks", "readme-qualified-evidence-v1.json"),
  scale: join(repoRoot, "docs", "benchmarks", "readme-controlled-scale-v1.svg")
});
const chartFiles = Object.freeze(["readme-qualified-grounding-v1.svg", "readme-controlled-scale-v1.svg"]);
const publication = Object.freeze({
  boundaries: Object.freeze([
    "Controlled synthetic integrity is not personal learning.",
    "Controlled evidence is not organic effectiveness.",
    "1,111,000 records are not 1,111,000 agent runs."
  ]),
  chartFiles,
  evidenceIndexLink: "docs/benchmarks/EVIDENCE.md",
  statuses: Object.freeze({ agentAggregate: "10/11 FAILED", organicEffectiveness: "NOT_PROVEN", recallCorrection: "UNQUALIFIED" })
});

function jsonBytes(value) { return `${canonicalJson(value)}\n`; }
function escapeXml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) throw new Error(`${label} fields mismatch`);
}
function exactMatch(text, regex, label) {
  const matches = [...text.matchAll(regex)];
  if (matches.length !== 1) throw new Error(`${label} source mismatch`);
  return matches[0];
}
function source(path, bytes) { return { path, sha256: sha256(bytes) }; }

export async function buildReadmeEvidenceResult() {
  const [selfAuthored, squad, scaleBytes] = await Promise.all([
    readFile(join(repoRoot, "docs", "benchmarks", "RESULTS.md"), "utf8"),
    readFile(join(repoRoot, "docs", "benchmarks", "RESULTS-squad.md"), "utf8"),
    readFile(join(repoRoot, "docs", "benchmarks", "eval-datasets-scale-v1.json"), "utf8")
  ]);
  exactMatch(selfAuthored, /\| gate \*\*ON\*\* \| 0\.94 \(16\/17\) \| 0\.00 \(0\/12\) \|/gu, "self-authored ON");
  exactMatch(selfAuthored, /\| gate \*\*OFF\*\* \| 0\.00 \(0\/17\) \| 0\.00 \(0\/12\) \|/gu, "self-authored OFF");
  exactMatch(selfAuthored, /\| \*\*Δ \(ON − OFF\)\*\* \| \*\*\+0\.94\*\* \| \+0\.00 \|/gu, "self-authored delta");
  exactMatch(squad, /\| gate \*\*ON\*\* \| 0\.63 \(5\/8\) \| 0\.00 \(0\/8\) \|/gu, "SQuAD ON");
  exactMatch(squad, /\| gate \*\*OFF\*\* \| 0\.00 \(0\/8\) \| 0\.00 \(0\/8\) \|/gu, "SQuAD OFF");
  exactMatch(squad, /\| \*\*Δ \(ON − OFF\)\*\* \| \*\*\+0\.63\*\* \| \+0\.00 \|/gu, "SQuAD delta");
  const scale = JSON.parse(scaleBytes);
  const corpora = scale.tiers?.map((tier) => tier.tier);
  if (canonicalJson(corpora) !== canonicalJson([1_000, 10_000, 100_000, 1_000_000])) throw new Error("scale corpus tiers drift");
  const expectedTotals = {
    generated: 1_111_000, serialized: 1_111_000, parsedAndSchemaValidated: 1_111_000,
    namedPublicMuseSeamExecuted: 768, terminalInvariantPassed: 768, llmCalls: 0, toolCalls: 0, networkCalls: 0
  };
  for (const [key, value] of Object.entries(expectedTotals)) if (scale.totals?.[key] !== value) throw new Error(`scale total drift: ${key}`);
  if (scale.matrix?.cells !== 96 || scale.ownerState?.byteStable !== true || scale.qualification !== "qualified-controlled-synthetic-integrity") throw new Error("scale qualification drift");
  const charts = [
    {
      boundary: "Independent controlled checks with distinct corpora and denominators; no aggregate score.",
      checks: [
        { falseRefusal: { delta: 0, off: [0, 12], on: [0, 12] }, faithfulness: { delta: 0.94, off: [0, 17], on: [16, 17] }, id: "self-authored" },
        { falseRefusal: { delta: 0, off: [0, 8], on: [0, 8] }, faithfulness: { delta: 0.63, off: [0, 8], on: [5, 8] }, id: "squad-2.0" }
      ],
      file: chartFiles[0], id: "qualified-grounding", status: "QUALIFIED_CONTROLLED_COMPONENT"
    },
    {
      boundary: "Full-corpus integrity counters are separate from the 768-record runtime sample; neither is an agent-run count.",
      calls: { llm: 0, network: 0, tool: 0 },
      corpora,
      file: chartFiles[1],
      fullCorpus: { generated: scale.totals.generated, parsedAndSchemaValidated: scale.totals.parsedAndSchemaValidated, serialized: scale.totals.serialized },
      id: "controlled-scale",
      ownerState: "BYTE_STABLE",
      runtimeSample: { matrixCells: scale.matrix.cells, namedPublicMuseSeams: [scale.totals.namedPublicMuseSeamExecuted, 768], terminalInvariants: [scale.totals.terminalInvariantPassed, 768] },
      status: "QUALIFIED_CONTROLLED_SYNTHETIC_INTEGRITY"
    }
  ];
  const payload = {
    charts,
    publication,
    sources: [
      source("docs/benchmarks/RESULTS.md", selfAuthored),
      source("docs/benchmarks/RESULTS-squad.md", squad),
      source("docs/benchmarks/eval-datasets-scale-v1.json", scaleBytes)
    ]
  };
  return validateReadmeEvidenceResult({ payload, payloadHash: sha256(jsonBytes(payload)), schemaVersion: README_EVIDENCE_SCHEMA_VERSION });
}

export function validateReadmeEvidenceResult(result) {
  exactKeys(result, ["payload", "payloadHash", "schemaVersion"], "README evidence result");
  exactKeys(result.payload, ["charts", "publication", "sources"], "README evidence payload");
  if (result.schemaVersion !== README_EVIDENCE_SCHEMA_VERSION || result.payloadHash !== sha256(jsonBytes(result.payload))) throw new Error("README evidence hash/version mismatch");
  if (canonicalJson(result.payload.publication) !== canonicalJson(publication)) throw new Error("README publication boundary drift");
  if (canonicalJson(result.payload.charts.map(({ file, id, status }) => ({ file, id, status }))) !== canonicalJson([
    { file: chartFiles[0], id: "qualified-grounding", status: "QUALIFIED_CONTROLLED_COMPONENT" },
    { file: chartFiles[1], id: "controlled-scale", status: "QUALIFIED_CONTROLLED_SYNTHETIC_INTEGRITY" }
  ])) throw new Error("README chart set drift");
  const [grounding, scale] = result.payload.charts;
  if (canonicalJson(grounding.checks) !== canonicalJson([
    { falseRefusal: { delta: 0, off: [0, 12], on: [0, 12] }, faithfulness: { delta: 0.94, off: [0, 17], on: [16, 17] }, id: "self-authored" },
    { falseRefusal: { delta: 0, off: [0, 8], on: [0, 8] }, faithfulness: { delta: 0.63, off: [0, 8], on: [5, 8] }, id: "squad-2.0" }
  ])) throw new Error("README grounding values drift");
  if (canonicalJson({ calls: scale.calls, corpora: scale.corpora, fullCorpus: scale.fullCorpus, ownerState: scale.ownerState, runtimeSample: scale.runtimeSample }) !== canonicalJson({
    calls: { llm: 0, network: 0, tool: 0 },
    corpora: [1_000, 10_000, 100_000, 1_000_000],
    fullCorpus: { generated: 1_111_000, parsedAndSchemaValidated: 1_111_000, serialized: 1_111_000 },
    ownerState: "BYTE_STABLE",
    runtimeSample: { matrixCells: 96, namedPublicMuseSeams: [768, 768], terminalInvariants: [768, 768] }
  })) throw new Error("README scale values drift");
  if (result.payload.sources.length !== 3) throw new Error("README source cardinality drift");
  for (const item of result.payload.sources) {
    exactKeys(item, ["path", "sha256"], `README source ${item?.path ?? "unknown"}`);
    if (!/^docs\/benchmarks\//u.test(item.path) || !/^[a-f0-9]{64}$/u.test(item.sha256)) throw new Error("README source provenance drift");
  }
  return result;
}

function svgShell(title, desc, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(title)}</title><desc id="desc">${escapeXml(desc)}</desc><style>text{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;fill:#172033}.title{font-size:28px;font-weight:760}.sub{font-size:14px;fill:#536075}.eyebrow{font-size:12px;font-weight:760;letter-spacing:1px;fill:#31526f}.label{font-size:17px;font-weight:720}.value{font-size:27px;font-weight:790}.metric{font-size:15px;font-weight:680}.meta{font-size:12px;fill:#536075}.footer{font-size:13px;font-weight:700;fill:#536075}.card{fill:#f8fafc;stroke:#cbd7e5;stroke-width:1.5}.pill{fill:#e8f1ff;stroke:#8fb4e8}.track{fill:#e7edf5}.bar{fill:#2563eb}.marker{fill:#fff;stroke:#172033;stroke-width:2}</style><rect width="1200" height="${height}" fill="#fff"/>${body}</svg>\n`;
}

export function renderQualifiedGroundingSvg(result) {
  validateReadmeEvidenceResult(result);
  const checks = result.payload.charts[0].checks;
  const labels = ["Self-authored corpus", "SQuAD-2.0 slice"];
  const rows = checks.map((check, index) => {
    const y = 116 + index * 198;
    const on = check.faithfulness.on; const off = check.faithfulness.off;
    return `<rect class="card" x="48" y="${y}" width="1104" height="174" rx="18"/><text class="eyebrow" x="72" y="${y + 30}">INDEPENDENT CHECK ${index + 1}</text><text class="label" x="72" y="${y + 60}">${labels[index]}</text><text class="value" x="72" y="${y + 111}">+${check.faithfulness.delta.toFixed(2)}</text><text class="meta" x="72" y="${y + 137}">faithfulness delta</text><text class="metric" x="390" y="${y + 68}">● Gate ON · ${on[0]}/${on[1]} caught</text><text class="metric" x="390" y="${y + 108}">○ Gate OFF · ${off[0]}/${off[1]} caught</text><text class="metric" x="760" y="${y + 68}">False-refusal delta · +${check.falseRefusal.delta.toFixed(2)}</text><text class="meta" x="760" y="${y + 108}">ON ${check.falseRefusal.on[0]}/${check.falseRefusal.on[1]} · OFF ${check.falseRefusal.off[0]}/${check.falseRefusal.off[1]}</text><rect class="track" x="390" y="${y + 130}" width="330" height="12" rx="6"/><rect class="bar" x="390" y="${y + 130}" width="${330 * on[0] / on[1]}" height="12" rx="6"/>`;
  }).join("");
  return svgShell(
    "Qualified grounding checks",
    "Two independent controlled checks show faithfulness deltas with their raw ON and OFF denominators and false-refusal cost. They are not an aggregate score and have different sample sizes.",
    600,
    `<text class="title" x="48" y="52">Qualified grounding checks</text><text class="sub" x="48" y="80">Independent controlled checks · raw counts and false-refusal cost · distinct sample sizes</text>${rows}<text class="footer" x="48" y="535">Two separate corpora (17 and 8 cases) · no average, ranking, or aggregate product score</text><text class="footer" x="48" y="560">Controlled component evidence is not organic personal effectiveness.</text>`
  );
}

export function renderControlledScaleSvg(result) {
  validateReadmeEvidenceResult(result);
  const scale = result.payload.charts[1];
  const total = scale.fullCorpus.generated.toLocaleString("en-US");
  const counters = [
    ["Generated", scale.fullCorpus.generated],
    ["Serialized", scale.fullCorpus.serialized],
    ["Parsed + schema validated", scale.fullCorpus.parsedAndSchemaValidated]
  ].map(([label, value], index) => {
    const x = 72 + index * 354;
    return `<rect class="pill" x="${x}" y="210" width="324" height="112" rx="14"/><text class="label" x="${x + 18}" y="244">${label}</text><text class="value" x="${x + 18}" y="286">${Number(value).toLocaleString("en-US")}/${total}</text>`;
  }).join("");
  return svgShell(
    "Controlled synthetic scale",
    "The full 1,111,000-record corpus integrity counters are shown separately from a 768-record runtime sample across 96 matrix cells. LLM, tool, and network calls are zero and owner state is byte-stable.",
    700,
    `<text class="title" x="48" y="52">Controlled synthetic scale</text><text class="sub" x="48" y="80">Full-corpus integrity and sampled runtime execution are separate denominators</text><rect class="card" x="48" y="112" width="1104" height="258" rx="18"/><text class="eyebrow" x="72" y="146">FULL CORPUS · integrity counters</text><text class="metric" x="72" y="180">Independent corpora · 1K · 10K · 100K · 1M</text>${counters}<text class="meta" x="72" y="349">96 family × locale × complexity matrix cells · parsed and schema validated is one combined stage</text><rect class="card" x="48" y="394" width="1104" height="184" rx="18"/><text class="eyebrow" x="72" y="430">SEPARATE 768-RECORD SAMPLE · runtime public seams</text><text class="value" x="72" y="484">768/768</text><text class="meta" x="72" y="510">named public Muse seams + terminal invariants</text><text class="metric" x="405" y="474">Matrix cells · 96</text><text class="metric" x="405" y="510">LLM / tool / network · 0 / 0 / 0</text><text class="metric" x="800" y="474">Owner state · BYTE-STABLE</text><text class="meta" x="800" y="510">sample execution, not full-corpus execution</text><text class="footer" x="48" y="625">Synthetic integrity is not personal learning or organic effectiveness.</text><text class="footer" x="48" y="650">1,111,000 records are not 1,111,000 agent runs · runtime sample = 768 records.</text>`
  );
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, value, { mode: 0o644 });
  await rename(temporary, path);
}

export async function validateReadmeEvidenceArtifacts(paths = outputPaths) {
  const bytes = await readFile(paths.manifest, "utf8");
  if (!bytes.endsWith("\n")) throw new Error("README evidence manifest must end with LF");
  const result = validateReadmeEvidenceResult(JSON.parse(bytes));
  if (bytes !== jsonBytes(result)) throw new Error("README evidence manifest canonical bytes drift");
  if (canonicalJson(await buildReadmeEvidenceResult()) !== canonicalJson(result)) throw new Error("README evidence source drift");
  if (await readFile(paths.grounding, "utf8") !== renderQualifiedGroundingSvg(result)) throw new Error("README grounding SVG drift");
  if (await readFile(paths.scale, "utf8") !== renderControlledScaleSvg(result)) throw new Error("README scale SVG drift");
  return result;
}

export async function renderReadmeEvidence(paths = outputPaths) {
  const result = await buildReadmeEvidenceResult();
  await writeAtomic(paths.manifest, jsonBytes(result));
  await writeAtomic(paths.grounding, renderQualifiedGroundingSvg(result));
  await writeAtomic(paths.scale, renderControlledScaleSvg(result));
  return validateReadmeEvidenceArtifacts(paths);
}

async function main() {
  const validate = process.argv.slice(2).filter((item) => item !== "--").includes("--validate");
  const result = validate ? await validateReadmeEvidenceArtifacts() : await renderReadmeEvidence();
  process.stdout.write(`${canonicalJson({ charts: chartFiles, payloadHash: result.payloadHash, status: "VALID" })}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
