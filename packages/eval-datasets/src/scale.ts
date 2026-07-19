import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CollisionDatabase,
  COMPLEXITIES,
  EVIDENCE_CLASS,
  FAMILIES,
  GENERATOR_VERSION,
  LOCALES,
  ROBUSTNESS_REPLAY_SEED,
  SCALE_SEEDS,
  SCHEMA_VERSION,
  TIERS,
  generateTier,
  assertExactKeys,
  ownerMuseManifest,
  resolveSafeEvalPath,
  validateTier,
  type Family,
  type Tier,
} from "./index.js";
import { executeStratifiedPublicSeams, type FamilyExecutionCounters } from "./seams.js";

export const CANONICAL_JSON = "docs/benchmarks/eval-datasets-scale-v1.json";
export const CANONICAL_CSV = "docs/benchmarks/eval-datasets-scale-v1.csv";
export const CANONICAL_MD = "docs/benchmarks/eval-datasets-scale-v1.md";
const TOTAL_BULK_LIMIT = 1_610_612_736;
const TOTAL_DISK_LIMIT = 2_147_483_648;
const TOTAL_WALL_LIMIT_MS = 900_000;

export type TierAggregate = {
  tier: Tier;
  seed: number;
  records: number;
  bytes: number;
  corpusSha256: string;
  collisions: { recordId: 0; topicHash: 0; contentHash: 0 };
  cellCount: 96;
  cellMinimum: number;
  cellMaximum: number;
  generationWallTimeMs: number;
  validationWallTimeMs: number;
  seamWallTimeMs: number;
  tierWallTimeMs: number;
  peakRssBytes: number;
  familyCounters: Record<Family, FamilyExecutionCounters>;
};

export type RobustnessReplayAggregate = {
  schemaVersion: typeof SCHEMA_VERSION;
  generatorVersion: typeof GENERATOR_VERSION;
  qualification: "qualified-controlled-synthetic-robustness-replay";
  dataOrigin: "synthetic";
  organicEvidence: false;
  personalLearningEligible: false;
  humanOutcome: false;
  heldOut: false;
  evidenceClass: typeof EVIDENCE_CLASS;
  robustnessReplay: true;
  tier: 1_000;
  seed: typeof ROBUSTNESS_REPLAY_SEED;
  generated: 1_000;
  serialized: 1_000;
  parsedAndSchemaValidated: 1_000;
  namedPublicMuseSeamExecuted: 192;
  terminalInvariantPassed: 192;
  llmCalls: 0;
  toolCalls: 0;
  networkCalls: 0;
  bytes: number;
  corpusSha256: string;
  collisions: { recordId: 0; topicHash: 0; contentHash: 0 };
  familyCounters: Record<Family, FamilyExecutionCounters>;
  peakRssBytes: number;
  wallTimeMs: number;
  collisionDatabaseTemporaryBytesPeak: number;
  recallSidecarTemporaryBytesPeak: number;
  ownerState: { entryCount: number; beforeDigest: string; afterDigest: string; byteStable: true };
  bulkCleanupVerified: true;
};

export type ScaleAggregate = {
  schemaVersion: typeof SCHEMA_VERSION;
  generatorVersion: typeof GENERATOR_VERSION;
  qualification: "qualified-controlled-synthetic-integrity";
  capabilityClaim: "corpus-integrity-and-sampled-public-seam-execution-only";
  dataOrigin: "synthetic";
  organicEvidence: false;
  personalLearningEligible: false;
  humanOutcome: false;
  heldOut: false;
  evidenceClass: typeof EVIDENCE_CLASS;
  robustnessReplay: false;
  matrix: { families: readonly Family[]; locales: typeof LOCALES; complexities: typeof COMPLEXITIES; cells: 96 };
  seamMapping: readonly { family: Family; publicSeam: string; execution: "sampled-public-seam" }[];
  tiers: TierAggregate[];
  totals: {
    generated: number;
    serialized: number;
    parsedAndSchemaValidated: number;
    namedPublicMuseSeamExecuted: number;
    terminalInvariantPassed: number;
    llmCalls: 0;
    toolCalls: 0;
    networkCalls: 0;
    bulkBytes: number;
    collisionDatabaseTemporaryBytesPeak: number;
    recallSidecarTemporaryBytesPeak: number;
    totalDiskBytesPeak: number;
    peakRssBytes: number;
    wholeRunWallTimeMs: number;
  };
  caps: {
    recordBytes: 16_384;
    totalBulkBytes: typeof TOTAL_BULK_LIMIT;
    totalDiskBytes: typeof TOTAL_DISK_LIMIT;
    peakRssBytes: 536_870_912;
    tierWallTimeMs: 300_000;
    wholeRunWallTimeMs: typeof TOTAL_WALL_LIMIT_MS;
    runtimeSamplePerTier: 192;
    runtimeSampleTotal: 768;
  };
  ownerState: { entryCount: number; beforeDigest: string; afterDigest: string; byteStable: true };
  robustnessReplayResult: RobustnessReplayAggregate;
  generatedAt: string;
};

const SEAM_MAPPING: ScaleAggregate["seamMapping"] = [
  { family: "recall-correction", publicSeam: "@muse/recall.prepareGroundedRecall", execution: "sampled-public-seam" },
  { family: "absent-abstention", publicSeam: "@muse/recall.prepareGroundedRecall", execution: "sampled-public-seam" },
  { family: "continuity", publicSeam: "@muse/attunement.prepareContinuityReview", execution: "sampled-public-seam" },
  { family: "memory-preference-veto-correction", publicSeam: "@muse/memory.InMemoryUserMemoryStore", execution: "sampled-public-seam" },
  { family: "tool-policy-approval", publicSeam: "@muse/policy.evaluateProgressiveAutonomy", execution: "sampled-public-seam" },
  { family: "context-stress", publicSeam: "@muse/memory.trimConversationMessages", execution: "sampled-public-seam" },
];

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, content, { encoding: "utf8", flag: "wx", mode: 0o644 });
  await rename(temp, path);
}

function totalCounters(tiers: readonly TierAggregate[]): Omit<ScaleAggregate["totals"], "bulkBytes" | "collisionDatabaseTemporaryBytesPeak" | "recallSidecarTemporaryBytesPeak" | "totalDiskBytesPeak" | "peakRssBytes" | "wholeRunWallTimeMs"> {
  return tiers.reduce((total, tier) => {
    for (const counter of Object.values(tier.familyCounters)) {
      total.generated += counter.generated;
      total.serialized += counter.serialized;
      total.parsedAndSchemaValidated += counter.parsedAndSchemaValidated;
      total.namedPublicMuseSeamExecuted += counter.namedPublicMuseSeamExecuted;
      total.terminalInvariantPassed += counter.terminalInvariantPassed;
    }
    return total;
  }, { generated: 0, serialized: 0, parsedAndSchemaValidated: 0, namedPublicMuseSeamExecuted: 0, terminalInvariantPassed: 0, llmCalls: 0 as const, toolCalls: 0 as const, networkCalls: 0 as const });
}

async function executeRobustnessReplay(cwd: string, versionRoot: string, label: string): Promise<RobustnessReplayAggregate> {
  const started = performance.now();
  const ownerBefore = await ownerMuseManifest();
  const replayRoot = resolve(versionRoot, `robustness-${label}`);
  const replayOut = resolve(replayRoot, "1000");
  if (await exists(replayRoot)) throw new Error("Robustness replay path already exists");
  let collisionDatabase: CollisionDatabase | undefined;
  try {
    const manifestPath = await generateTier({ tier: 1_000, seed: ROBUSTNESS_REPLAY_SEED, out: replayOut, cwd, robustnessReplay: true });
    const collisionPath = resolve(replayRoot, "replay-collisions.sqlite");
    collisionDatabase = new CollisionDatabase(collisionPath);
    const validation = await validateTier(manifestPath, { cwd, collisionDatabase });
    const seam = await executeStratifiedPublicSeams(validation.sample, validation.manifest.familyCounts, cwd, replayRoot);
    collisionDatabase.flush();
    const collisionDatabaseTemporaryBytesPeak = (await stat(collisionPath)).size;
    const wallTimeMs = Math.round(performance.now() - started);
    if (validation.manifest.robustnessReplay !== true || validation.manifest.heldOut !== false || validation.parsedAndSchemaValidated !== 1_000 || seam.executed !== 192 || seam.passed !== 192 || seam.llmCalls !== 0 || seam.toolCalls !== 0 || seam.networkCalls !== 0) throw new Error("Robustness replay qualification failed");
    collisionDatabase.close();
    collisionDatabase = undefined;
    const resultWithoutOwner = {
      schemaVersion: SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      qualification: "qualified-controlled-synthetic-robustness-replay" as const,
      dataOrigin: "synthetic" as const,
      organicEvidence: false as const,
      personalLearningEligible: false as const,
      humanOutcome: false as const,
      heldOut: false as const,
      evidenceClass: EVIDENCE_CLASS,
      robustnessReplay: true as const,
      tier: 1_000 as const,
      seed: ROBUSTNESS_REPLAY_SEED as typeof ROBUSTNESS_REPLAY_SEED,
      generated: 1_000 as const,
      serialized: 1_000 as const,
      parsedAndSchemaValidated: 1_000 as const,
      namedPublicMuseSeamExecuted: 192 as const,
      terminalInvariantPassed: 192 as const,
      llmCalls: 0 as const,
      toolCalls: 0 as const,
      networkCalls: 0 as const,
      bytes: validation.manifest.bytes,
      corpusSha256: validation.manifest.corpusSha256,
      collisions: validation.collisionCounts,
      familyCounters: seam.familyCounters,
      peakRssBytes: Math.max(validation.manifest.peakRssBytes, validation.peakRssBytes, process.memoryUsage().rss),
      wallTimeMs,
      collisionDatabaseTemporaryBytesPeak,
      recallSidecarTemporaryBytesPeak: seam.temporaryBytesPeak,
    };
    await rm(replayRoot, { recursive: true, force: true });
    if (await exists(replayRoot)) throw new Error("Robustness replay bulk cleanup failed");
    const ownerAfter = await ownerMuseManifest();
    if (ownerBefore.exists !== ownerAfter.exists || ownerBefore.entryCount !== ownerAfter.entryCount || ownerBefore.digest !== ownerAfter.digest) throw new Error("Owner state changed during robustness replay");
    return {
      ...resultWithoutOwner,
      ownerState: { entryCount: ownerBefore.entryCount, beforeDigest: ownerBefore.digest, afterDigest: ownerAfter.digest, byteStable: true },
      bulkCleanupVerified: true,
    };
  } finally {
    try { collisionDatabase?.close(); } catch {}
    await rm(replayRoot, { recursive: true, force: true });
  }
}

export function renderCsv(aggregate: ScaleAggregate): string {
  const header = "evidence_scope,tier,seed,family,data_origin,organic_evidence,personal_learning_eligible,human_outcome,held_out,evidence_class,robustness_replay,generated,serialized,parsed_and_schema_validated,named_public_muse_seam_executed,terminal_invariant_passed,llm_calls,tool_calls,network_calls\n";
  const rows = aggregate.tiers.flatMap((tier) => FAMILIES.map((family) => {
    const value = tier.familyCounters[family];
    return ["main-scale", tier.tier, tier.seed, family, aggregate.dataOrigin, aggregate.organicEvidence, aggregate.personalLearningEligible, aggregate.humanOutcome, aggregate.heldOut, aggregate.evidenceClass, aggregate.robustnessReplay, value.generated, value.serialized, value.parsedAndSchemaValidated, value.namedPublicMuseSeamExecuted, value.terminalInvariantPassed, value.llmCalls, value.toolCalls, value.networkCalls].join(",");
  }));
  for (const family of FAMILIES) {
    const value = aggregate.robustnessReplayResult.familyCounters[family];
    rows.push(["robustness-replay", aggregate.robustnessReplayResult.tier, aggregate.robustnessReplayResult.seed, family, aggregate.robustnessReplayResult.dataOrigin, aggregate.robustnessReplayResult.organicEvidence, aggregate.robustnessReplayResult.personalLearningEligible, aggregate.robustnessReplayResult.humanOutcome, aggregate.robustnessReplayResult.heldOut, aggregate.robustnessReplayResult.evidenceClass, aggregate.robustnessReplayResult.robustnessReplay, value.generated, value.serialized, value.parsedAndSchemaValidated, value.namedPublicMuseSeamExecuted, value.terminalInvariantPassed, value.llmCalls, value.toolCalls, value.networkCalls].join(","));
  }
  return `${header}${rows.join("\n")}\n`;
}

export function renderMarkdown(aggregate: ScaleAggregate): string {
  const lines = [
    "# Controlled synthetic scale evaluation",
    "",
    "> This is synthetic, non-organic, non-learning corpus-integrity evidence. Generated count is not a capability, effect, or generalization claim.",
    "",
    `Qualification: **${aggregate.qualification}**`,
    "",
    "| Tier | Records | Bulk bytes | Public-seam sample | Terminal passes |",
    "| ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const tier of aggregate.tiers) {
    const executed = Object.values(tier.familyCounters).reduce((sum, item) => sum + item.namedPublicMuseSeamExecuted, 0);
    const passed = Object.values(tier.familyCounters).reduce((sum, item) => sum + item.terminalInvariantPassed, 0);
    lines.push(`| ${tier.tier} | ${tier.records} | ${tier.bytes} | ${executed} | ${passed} |`);
  }
  lines.push(
    "",
    `All tiers: ${aggregate.totals.generated} generated, ${aggregate.totals.parsedAndSchemaValidated} parsed and schema-validated, ${aggregate.totals.namedPublicMuseSeamExecuted} named public-seam executions, ${aggregate.totals.terminalInvariantPassed} terminal invariant passes.`,
    "",
    `Calls: LLM ${aggregate.totals.llmCalls}, tool ${aggregate.totals.toolCalls}, network ${aggregate.totals.networkCalls}. Owner-state byte stability: ${aggregate.ownerState.byteStable ? "pass" : "fail"}.`,
    "",
    `Separate robustness replay (not included in the 1,111,000 totals): fixed fresh seed ${aggregate.robustnessReplayResult.seed}, ${aggregate.robustnessReplayResult.parsedAndSchemaValidated}/1,000 schema-valid, ${aggregate.robustnessReplayResult.terminalInvariantPassed}/192 sampled terminal passes, robustnessReplay=true, heldOut=false, LLM/tool/network calls 0/0/0, owner-state stable, local bulk cleanup ${aggregate.robustnessReplayResult.bulkCleanupVerified ? "pass" : "fail"}. This is robustness replay evidence, not held-out generalization evidence.`,
    "",
  );
  return lines.join("\n");
}

const AGGREGATE_KEYS = ["schemaVersion", "generatorVersion", "qualification", "capabilityClaim", "dataOrigin", "organicEvidence", "personalLearningEligible", "humanOutcome", "heldOut", "evidenceClass", "robustnessReplay", "matrix", "seamMapping", "tiers", "totals", "caps", "ownerState", "robustnessReplayResult", "generatedAt"] as const;
const TIER_KEYS = ["tier", "seed", "records", "bytes", "corpusSha256", "collisions", "cellCount", "cellMinimum", "cellMaximum", "generationWallTimeMs", "validationWallTimeMs", "seamWallTimeMs", "tierWallTimeMs", "peakRssBytes", "familyCounters"] as const;
const COUNTER_KEYS = ["generated", "serialized", "parsedAndSchemaValidated", "namedPublicMuseSeamExecuted", "terminalInvariantPassed", "llmCalls", "toolCalls", "networkCalls"] as const;
const TOTAL_KEYS = [...COUNTER_KEYS, "bulkBytes", "collisionDatabaseTemporaryBytesPeak", "recallSidecarTemporaryBytesPeak", "totalDiskBytesPeak", "peakRssBytes", "wholeRunWallTimeMs"] as const;
const CAP_KEYS = ["recordBytes", "totalBulkBytes", "totalDiskBytes", "peakRssBytes", "tierWallTimeMs", "wholeRunWallTimeMs", "runtimeSamplePerTier", "runtimeSampleTotal"] as const;
const OWNER_KEYS = ["entryCount", "beforeDigest", "afterDigest", "byteStable"] as const;
const REPLAY_KEYS = ["schemaVersion", "generatorVersion", "qualification", "dataOrigin", "organicEvidence", "personalLearningEligible", "humanOutcome", "heldOut", "evidenceClass", "robustnessReplay", "tier", "seed", "generated", "serialized", "parsedAndSchemaValidated", "namedPublicMuseSeamExecuted", "terminalInvariantPassed", "llmCalls", "toolCalls", "networkCalls", "bytes", "corpusSha256", "collisions", "familyCounters", "peakRssBytes", "wallTimeMs", "collisionDatabaseTemporaryBytesPeak", "recallSidecarTemporaryBytesPeak", "ownerState", "bulkCleanupVerified"] as const;

function assertFamilyCounters(value: Record<Family, FamilyExecutionCounters>, expectedRecords: number, expectedSeams: number, label: string): void {
  assertExactKeys(value, FAMILIES, `${label} families`);
  let records = 0;
  let seams = 0;
  for (const family of FAMILIES) {
    const counter = value[family];
    assertExactKeys(counter, COUNTER_KEYS, `${label} ${family} counter`);
    if (counter.generated !== counter.serialized || counter.generated !== counter.parsedAndSchemaValidated || counter.namedPublicMuseSeamExecuted !== counter.terminalInvariantPassed || counter.llmCalls !== 0 || counter.toolCalls !== 0 || counter.networkCalls !== 0) throw new Error(`${label} ${family} counter failed closed`);
    records += counter.generated;
    seams += counter.namedPublicMuseSeamExecuted;
  }
  if (records !== expectedRecords || seams !== expectedSeams) throw new Error(`${label} family totals are not exact`);
}

function assertAggregate(aggregate: ScaleAggregate): void {
  assertExactKeys(aggregate, AGGREGATE_KEYS, "Aggregate");
  assertExactKeys(aggregate.matrix, ["families", "locales", "complexities", "cells"], "Aggregate matrix");
  assertExactKeys(aggregate.totals, TOTAL_KEYS, "Aggregate totals");
  assertExactKeys(aggregate.caps, CAP_KEYS, "Aggregate caps");
  assertExactKeys(aggregate.ownerState, OWNER_KEYS, "Aggregate owner state");
  if (JSON.stringify(aggregate.matrix) !== JSON.stringify({ families: FAMILIES, locales: LOCALES, complexities: COMPLEXITIES, cells: 96 })) throw new Error("Aggregate matrix is not exact");
  if (JSON.stringify(aggregate.seamMapping) !== JSON.stringify(SEAM_MAPPING)) throw new Error("Aggregate seam mapping is not exact");
  if (aggregate.schemaVersion !== SCHEMA_VERSION || aggregate.generatorVersion !== GENERATOR_VERSION || aggregate.qualification !== "qualified-controlled-synthetic-integrity" || aggregate.capabilityClaim !== "corpus-integrity-and-sampled-public-seam-execution-only" || typeof aggregate.generatedAt !== "string" || !Number.isFinite(Date.parse(aggregate.generatedAt))) throw new Error("Aggregate identity is invalid");
  if (JSON.stringify(aggregate.caps) !== JSON.stringify({ recordBytes: 16_384, totalBulkBytes: TOTAL_BULK_LIMIT, totalDiskBytes: TOTAL_DISK_LIMIT, peakRssBytes: 536_870_912, tierWallTimeMs: 300_000, wholeRunWallTimeMs: TOTAL_WALL_LIMIT_MS, runtimeSamplePerTier: 192, runtimeSampleTotal: 768 })) throw new Error("Aggregate caps are not exact");
  if (aggregate.dataOrigin !== "synthetic" || aggregate.organicEvidence !== false || aggregate.personalLearningEligible !== false || aggregate.humanOutcome !== false || aggregate.heldOut !== false || aggregate.evidenceClass !== EVIDENCE_CLASS || aggregate.robustnessReplay !== false) throw new Error("Aggregate provenance failed closed");
  if (aggregate.tiers.length !== TIERS.length || aggregate.totals.generated !== 1_111_000 || aggregate.totals.generated !== aggregate.totals.serialized || aggregate.totals.generated !== aggregate.totals.parsedAndSchemaValidated) throw new Error("Aggregate exact-count gate failed");
  if (aggregate.totals.namedPublicMuseSeamExecuted !== 768 || aggregate.totals.terminalInvariantPassed !== 768) throw new Error("Aggregate stratified public-seam gate failed");
  if (aggregate.totals.llmCalls !== 0 || aggregate.totals.toolCalls !== 0 || aggregate.totals.networkCalls !== 0) throw new Error("Scale evaluation made a forbidden external call");
  if (aggregate.totals.bulkBytes > TOTAL_BULK_LIMIT) throw new Error("Scale evaluation exceeded the 1.5 GiB four-tier bulk cap");
  if (aggregate.totals.totalDiskBytesPeak > TOTAL_DISK_LIMIT) throw new Error("Scale evaluation exceeded the 2 GiB bulk-plus-temporary safety cap");
  if (aggregate.totals.peakRssBytes > 536_870_912) throw new Error("Scale evaluation exceeded the 512 MiB RSS cap");
  if (aggregate.totals.wholeRunWallTimeMs > TOTAL_WALL_LIMIT_MS || aggregate.tiers.some((tier) => tier.tierWallTimeMs > 300_000)) throw new Error("Scale evaluation exceeded a wall-time cap");
  if (!aggregate.ownerState.byteStable || aggregate.ownerState.beforeDigest !== aggregate.ownerState.afterDigest) throw new Error("Owner state changed during scale evaluation");
  for (const [index, tier] of aggregate.tiers.entries()) {
    assertExactKeys(tier, TIER_KEYS, `Tier ${tier.tier}`);
    assertExactKeys(tier.collisions, ["recordId", "topicHash", "contentHash"], `Tier ${tier.tier} collisions`);
    assertFamilyCounters(tier.familyCounters, tier.records, 192, `Tier ${tier.tier}`);
    if (tier.tier !== TIERS[index] || tier.seed !== SCALE_SEEDS[tier.tier] || tier.records !== tier.tier || typeof tier.corpusSha256 !== "string" || !/^[a-f0-9]{64}$/.test(tier.corpusSha256) || tier.cellCount !== 96 || tier.cellMaximum - tier.cellMinimum > 1 || Object.values(tier.collisions).some((count) => count !== 0)) throw new Error(`Tier ${tier.tier} integrity gate failed`);
  }
  if (aggregate.totals.bulkBytes !== aggregate.tiers.reduce((sum, tier) => sum + tier.bytes, 0)) throw new Error("Aggregate bulk byte accounting is not exact");
  const replay = aggregate.robustnessReplayResult;
  assertExactKeys(replay, REPLAY_KEYS, "Robustness replay result");
  assertExactKeys(replay.collisions, ["recordId", "topicHash", "contentHash"], "Robustness replay collisions");
  assertExactKeys(replay.ownerState, OWNER_KEYS, "Robustness replay owner state");
  assertFamilyCounters(replay.familyCounters, 1_000, 192, "Robustness replay");
  if (replay.schemaVersion !== SCHEMA_VERSION || replay.generatorVersion !== GENERATOR_VERSION || replay.qualification !== "qualified-controlled-synthetic-robustness-replay" || replay.dataOrigin !== "synthetic" || replay.organicEvidence !== false || replay.personalLearningEligible !== false || replay.humanOutcome !== false || replay.heldOut !== false || replay.evidenceClass !== EVIDENCE_CLASS || replay.robustnessReplay !== true || replay.tier !== 1_000 || replay.seed !== ROBUSTNESS_REPLAY_SEED || replay.generated !== 1_000 || replay.serialized !== 1_000 || replay.parsedAndSchemaValidated !== 1_000 || replay.namedPublicMuseSeamExecuted !== 192 || replay.terminalInvariantPassed !== 192 || replay.llmCalls !== 0 || replay.toolCalls !== 0 || replay.networkCalls !== 0 || typeof replay.corpusSha256 !== "string" || !/^[a-f0-9]{64}$/.test(replay.corpusSha256) || Object.values(replay.collisions).some((count) => count !== 0) || replay.peakRssBytes > 536_870_912 || replay.wallTimeMs > 300_000 || !replay.bulkCleanupVerified || !replay.ownerState.byteStable || replay.ownerState.beforeDigest !== replay.ownerState.afterDigest) throw new Error("Robustness replay result failed closed");
  const expectedTotalDisk = aggregate.totals.bulkBytes + aggregate.totals.collisionDatabaseTemporaryBytesPeak + aggregate.totals.recallSidecarTemporaryBytesPeak + replay.bytes + replay.collisionDatabaseTemporaryBytesPeak + replay.recallSidecarTemporaryBytesPeak;
  if (aggregate.totals.totalDiskBytesPeak !== expectedTotalDisk) throw new Error("Aggregate total disk accounting is not exact");
}

export async function runScale(cwd = process.cwd()): Promise<ScaleAggregate> {
  const wholeStarted = performance.now();
  const ownerBefore = await ownerMuseManifest();
  const versionRoot = await resolveSafeEvalPath(`.muse-dev/eval-data/${GENERATOR_VERSION}/.scale-placeholder`, cwd).then((path) => resolve(path, ".."));
  await mkdir(versionRoot, { recursive: true, mode: 0o700 });
  const runDir = resolve(versionRoot, `.scale-run-${process.pid}-${Date.now()}`);
  await mkdir(runDir, { mode: 0o700 });
  const collisionPath = resolve(runDir, "collisions.sqlite");
  const collisionDatabase = new CollisionDatabase(collisionPath);
  const tiers: TierAggregate[] = [];
  let collisionTemporaryBytesPeak = 0;
  let recallSidecarTemporaryBytesPeak = 0;
  try {
    for (const tier of TIERS) {
      const out = `.muse-dev/eval-data/${GENERATOR_VERSION}/${tier}`;
      const candidateManifest = resolve(cwd, out, "manifest.json");
      const manifestPath = await exists(candidateManifest) ? candidateManifest : await generateTier({ tier, seed: SCALE_SEEDS[tier], out, cwd });
      const validation = await validateTier(manifestPath, { cwd, collisionDatabase });
      if (validation.manifest.seed !== SCALE_SEEDS[tier]) throw new Error(`Tier ${tier} does not use its fixed independent seed`);
      const seamStarted = performance.now();
      const seam = await executeStratifiedPublicSeams(validation.sample, validation.manifest.familyCounts, cwd);
      recallSidecarTemporaryBytesPeak = Math.max(recallSidecarTemporaryBytesPeak, seam.temporaryBytesPeak);
      const seamWallTimeMs = Math.round(performance.now() - seamStarted);
      collisionDatabase.flush();
      collisionTemporaryBytesPeak = Math.max(collisionTemporaryBytesPeak, (await stat(collisionPath)).size);
      const cellValues = Object.values(validation.manifest.cellCounts);
      const tierWallTimeMs = validation.manifest.wallTimeMs + validation.wallTimeMs + seamWallTimeMs;
      const aggregate: TierAggregate = {
        tier,
        seed: validation.manifest.seed,
        records: validation.manifest.recordCount,
        bytes: validation.manifest.bytes,
        corpusSha256: validation.manifest.corpusSha256,
        collisions: validation.collisionCounts,
        cellCount: 96,
        cellMinimum: Math.min(...cellValues),
        cellMaximum: Math.max(...cellValues),
        generationWallTimeMs: validation.manifest.wallTimeMs,
        validationWallTimeMs: validation.wallTimeMs,
        seamWallTimeMs,
        tierWallTimeMs,
        peakRssBytes: Math.max(validation.manifest.peakRssBytes, validation.peakRssBytes, process.memoryUsage().rss),
        familyCounters: seam.familyCounters,
      };
      if (aggregate.tierWallTimeMs > 300_000) throw new Error(`Tier ${tier} exceeded the five-minute aggregate cap`);
      tiers.push(aggregate);
      if (performance.now() - wholeStarted > TOTAL_WALL_LIMIT_MS) throw new Error("Scale run exceeded the fifteen-minute cap");
    }
    collisionDatabase.flush();
    const robustnessReplayResult = await executeRobustnessReplay(cwd, versionRoot, `${process.pid}-${Date.now()}`);
    collisionDatabase.close();
    const ownerAfter = await ownerMuseManifest();
    if (ownerBefore.exists !== ownerAfter.exists || ownerBefore.entryCount !== ownerAfter.entryCount || ownerBefore.digest !== ownerAfter.digest) throw new Error("Owner state changed during scale evaluation");
    const bulkBytes = tiers.reduce((sum, tier) => sum + tier.bytes, 0);
    const baseTotals = totalCounters(tiers);
    const aggregate: ScaleAggregate = {
      schemaVersion: SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      qualification: "qualified-controlled-synthetic-integrity",
      capabilityClaim: "corpus-integrity-and-sampled-public-seam-execution-only",
      dataOrigin: "synthetic",
      organicEvidence: false,
      personalLearningEligible: false,
      humanOutcome: false,
      heldOut: false,
      evidenceClass: EVIDENCE_CLASS,
      robustnessReplay: false,
      matrix: { families: FAMILIES, locales: LOCALES, complexities: COMPLEXITIES, cells: 96 },
      seamMapping: SEAM_MAPPING,
      tiers,
      totals: {
        ...baseTotals,
        bulkBytes,
        collisionDatabaseTemporaryBytesPeak: collisionTemporaryBytesPeak,
        recallSidecarTemporaryBytesPeak,
        totalDiskBytesPeak: bulkBytes + collisionTemporaryBytesPeak + recallSidecarTemporaryBytesPeak + robustnessReplayResult.bytes + robustnessReplayResult.collisionDatabaseTemporaryBytesPeak + robustnessReplayResult.recallSidecarTemporaryBytesPeak,
        peakRssBytes: Math.max(robustnessReplayResult.peakRssBytes, ...tiers.map((tier) => tier.peakRssBytes)),
        wholeRunWallTimeMs: Math.round(performance.now() - wholeStarted),
      },
      caps: {
        recordBytes: 16_384,
        totalBulkBytes: TOTAL_BULK_LIMIT,
        totalDiskBytes: TOTAL_DISK_LIMIT,
        peakRssBytes: 536_870_912,
        tierWallTimeMs: 300_000,
        wholeRunWallTimeMs: TOTAL_WALL_LIMIT_MS,
        runtimeSamplePerTier: 192,
        runtimeSampleTotal: 768,
      },
      ownerState: { entryCount: ownerBefore.entryCount, beforeDigest: ownerBefore.digest, afterDigest: ownerAfter.digest, byteStable: true },
      robustnessReplayResult,
      generatedAt: new Date().toISOString(),
    };
    assertAggregate(aggregate);
    await atomicWrite(resolve(cwd, CANONICAL_JSON), `${JSON.stringify(aggregate, null, 2)}\n`);
    await atomicWrite(resolve(cwd, CANONICAL_CSV), renderCsv(aggregate));
    await atomicWrite(resolve(cwd, CANONICAL_MD), renderMarkdown(aggregate));
    return aggregate;
  } finally {
    try { collisionDatabase.close(); } catch {}
    await rm(runDir, { recursive: true, force: true });
  }
}

export function parseAggregate(value: unknown): ScaleAggregate {
  if (!value || typeof value !== "object") throw new Error("Canonical scale JSON must be an object");
  const aggregate = value as ScaleAggregate;
  assertAggregate(aggregate);
  return aggregate;
}

export async function validateScale(cwd = process.cwd()): Promise<ScaleAggregate> {
  const started = performance.now();
  const ownerBefore = await ownerMuseManifest();
  const aggregate = parseAggregate(JSON.parse(await readFile(resolve(cwd, CANONICAL_JSON), "utf8")) as unknown);
  if (await readFile(resolve(cwd, CANONICAL_CSV), "utf8") !== renderCsv(aggregate)) throw new Error("Derived CSV bytes do not reconcile with canonical JSON");
  if (await readFile(resolve(cwd, CANONICAL_MD), "utf8") !== renderMarkdown(aggregate)) throw new Error("Derived Markdown bytes do not reconcile with canonical JSON");
  const versionRoot = resolve(cwd, ".muse-dev", "eval-data", GENERATOR_VERSION);
  const runDir = resolve(versionRoot, `.scale-validate-${process.pid}-${Date.now()}`);
  await mkdir(runDir, { mode: 0o700 });
  const collisionDatabase = new CollisionDatabase(resolve(runDir, "collisions.sqlite"));
  try {
    for (const tier of aggregate.tiers) {
      const result = await validateTier(resolve(versionRoot, String(tier.tier), "manifest.json"), { cwd, collisionDatabase });
      if (result.manifest.seed !== tier.seed || result.manifest.bytes !== tier.bytes || result.manifest.corpusSha256 !== tier.corpusSha256) throw new Error(`Canonical JSON does not reconcile with tier ${tier.tier}`);
      const seams = await executeStratifiedPublicSeams(result.sample, result.manifest.familyCounts, cwd);
      if (seams.executed !== 192 || seams.passed !== 192) throw new Error(`Tier ${tier.tier} public-seam replay failed`);
      if (performance.now() - started > TOTAL_WALL_LIMIT_MS) throw new Error("Scale validator exceeded fifteen minutes");
    }
    const replay = await executeRobustnessReplay(cwd, versionRoot, `validate-${process.pid}-${Date.now()}`);
    const canonicalReplay = aggregate.robustnessReplayResult;
    if (replay.seed !== canonicalReplay.seed || replay.bytes !== canonicalReplay.bytes || replay.corpusSha256 !== canonicalReplay.corpusSha256 || replay.generated !== canonicalReplay.generated || replay.parsedAndSchemaValidated !== canonicalReplay.parsedAndSchemaValidated || replay.namedPublicMuseSeamExecuted !== canonicalReplay.namedPublicMuseSeamExecuted || replay.terminalInvariantPassed !== canonicalReplay.terminalInvariantPassed || JSON.stringify(replay.collisions) !== JSON.stringify(canonicalReplay.collisions) || JSON.stringify(replay.familyCounters) !== JSON.stringify(canonicalReplay.familyCounters)) throw new Error("Canonical robustness replay does not reconcile with fresh execution");
    const ownerAfter = await ownerMuseManifest();
    if (ownerBefore.exists !== ownerAfter.exists || ownerBefore.entryCount !== ownerAfter.entryCount || ownerBefore.digest !== ownerAfter.digest) throw new Error("Owner state changed during scale validation");
    return aggregate;
  } finally {
    try { collisionDatabase.close(); } catch {}
    await rm(runDir, { recursive: true, force: true });
  }
}
