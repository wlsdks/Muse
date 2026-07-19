import { mkdir, rm, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CollisionDatabase,
  FAMILIES,
  LOCALES,
  assertExactSyntheticRecord,
  assertManifest,
  expectedCellCounts,
  generateRecord,
  resolveSafeEvalPath,
  type EvalRecord,
  type Family,
  type Locale,
  type TierManifest,
} from "./index.js";
import { trimConversationMessages } from "@muse/memory";

const cleanup: string[] = [];

afterEach(async () => {
  for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true });
});

function recordFor(family: Family, locale: Locale): EvalRecord {
  for (let sequence = 0; sequence < 96; sequence += 1) {
    const record = generateRecord(1_000, 120_031, sequence);
    if (record.family === family && record.locale === locale) return record;
  }
  throw new Error(`Missing ${family}/${locale}`);
}

describe("closed synthetic record union", () => {
  it("requires every explicit non-organic, non-learning field", () => {
    const valid = generateRecord(1_000, 120_031, 0);
    expect(() => assertExactSyntheticRecord(valid)).not.toThrow();
    for (const mutation of [
      { ...valid, dataOrigin: "organic" },
      { ...valid, organicEvidence: true },
      { ...valid, personalLearningEligible: true },
      { ...valid, humanOutcome: true },
      { ...valid, heldOut: true },
      { ...valid, evidenceClass: "organic" },
    ]) expect(() => assertExactSyntheticRecord(mutation)).toThrow(/Synthetic provenance/);
    const replay = generateRecord(1_000, 520_057, 0, { robustnessReplay: true });
    expect(replay.robustnessReplay).toBe(true);
    expect(replay.heldOut).toBe(false);
    expect(() => assertExactSyntheticRecord(replay)).not.toThrow();
  });

  it("rejects unknown fields, arbitrary personal-looking content, and missing fields", () => {
    const valid = generateRecord(1_000, 120_031, 0);
    expect(() => assertExactSyntheticRecord({ ...valid, ownerEmail: "person@example.test" })).toThrow(/fixed fictional generator allowlist/);
    expect(() => assertExactSyntheticRecord({ ...valid, payload: { ...valid.payload, query: "/Users/real/.muse/private" } })).toThrow(/fixed fictional generator allowlist/);
    const { expected: _expected, ...missingExpected } = valid;
    expect(() => assertExactSyntheticRecord(missingExpected)).toThrow(/fixed fictional generator allowlist/);
  });

  it("uses locale-native, family-specific user text instead of lexeme substitution", () => {
    const en = recordFor("recall-correction", "en") as Extract<EvalRecord, { family: "recall-correction" }>;
    const ko = recordFor("recall-correction", "ko") as Extract<EvalRecord, { family: "recall-correction" }>;
    const ja = recordFor("recall-correction", "ja") as Extract<EvalRecord, { family: "recall-correction" }>;
    const zh = recordFor("recall-correction", "zh-CN") as Extract<EvalRecord, { family: "recall-correction" }>;
    expect(en.payload.query).toContain("Which revision is current");
    expect(ko.payload.query).toMatch(/[가-힣].*업무 계획/);
    expect(ja.payload.query).toMatch(/[ぁ-んァ-ヶ一-龯].*仕事計画/);
    expect(zh.payload.query).toMatch(/工作计划.*修订版/);
    expect(new Set([en.payload.query, ko.payload.query, ja.payload.query, zh.payload.query]).size).toBe(4);
  });

  it("balances all 96 family-locale-complexity cells within one", () => {
    const counts = expectedCellCounts(1_000, 120_031);
    expect(Object.keys(counts)).toHaveLength(96);
    expect(FAMILIES).toHaveLength(6);
    expect(LOCALES).toHaveLength(4);
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(1);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(1_000);
  });

  it("hashes semantic payload independently of record identity", async () => {
    const root = resolve(process.cwd(), ".muse-dev", "eval-data", "v1", `.collision-test-${process.pid}-${Date.now()}`);
    cleanup.push(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const database = new CollisionDatabase(resolve(root, "collisions.sqlite"));
    const first = generateRecord(1_000, 120_031, 0);
    const identityOnlyChange = { ...first, recordId: `${first.recordId}-other`, tier: 10_000 as const, seed: 220_033, sequence: 99 };
    try {
      database.add(first);
      expect(() => database.add(identityOnlyChange)).toThrow(/collision/);
    } finally {
      database.close();
    }
  });

  it("keeps fixed-seed tier scenarios semantically disjoint", async () => {
    const root = resolve(process.cwd(), ".muse-dev", "eval-data", "v1", `.disjoint-test-${process.pid}-${Date.now()}`);
    cleanup.push(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const database = new CollisionDatabase(resolve(root, "collisions.sqlite"));
    try {
      for (const [tier, seed] of [[1_000, 120_031], [10_000, 220_033], [100_000, 320_039], [1_000_000, 420_041]] as const) {
        for (let sequence = 0; sequence < 192; sequence += 1) database.add(generateRecord(tier, seed, sequence));
      }
    } finally {
      database.close();
    }
  });

  it("keeps every generated record below 16 KiB", () => {
    for (const sequence of [0, 1, 95, 999_904, 999_999]) {
      const record = generateRecord(1_000_000, 420_041, sequence);
      expect(Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8")).toBeLessThanOrEqual(16_384);
    }
  });

  it("declares and enforces controlled continuity exclusion", () => {
    const record = recordFor("continuity", "en") as Extract<EvalRecord, { family: "continuity" }>;
    expect(record.expected.terminal).toBe("controlled-excluded-from-next");
    expect(() => assertExactSyntheticRecord({ ...record, expected: { terminal: "review-prepared" } })).toThrow(/fixed fictional generator allowlist/);
  });

  it("makes every long-context fixture actually trim within budget", () => {
    for (let sequence = 0; sequence < 192; sequence += 1) {
      const record = generateRecord(1_000, 120_031, sequence);
      if (record.family !== "context-stress" || record.complexity !== "long-context") continue;
      const messages = record.payload.messages.map((content, index) => ({ role: index % 2 === 0 ? "user" as const : "assistant" as const, content }));
      const result = trimConversationMessages(messages, { maxContextWindowTokens: record.payload.maxContextWindowTokens, outputReserveTokens: record.payload.outputReserveTokens, insertSummary: false });
      expect(record.expected.trimmingRequired).toBe(true);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.estimatedTokens).toBeLessThanOrEqual(result.budgetTokens);
    }
  });
});

function manifestFixture(): TierManifest {
  const cellCounts = expectedCellCounts(1_000, 120_031);
  const familyCounts = Object.fromEntries(FAMILIES.map((family) => [family, 0])) as TierManifest["familyCounts"];
  for (const [key, count] of Object.entries(cellCounts)) familyCounts[key.split("|")[0] as Family] += count;
  return {
    schemaVersion: 1,
    generatorVersion: "v1",
    tier: 1_000,
    seed: 120_031,
    recordsFile: "records.jsonl",
    recordCount: 1_000,
    serializedCount: 1_000,
    bytes: 1,
    corpusSha256: "a".repeat(64),
    dataOrigin: "synthetic",
    organicEvidence: false,
    personalLearningEligible: false,
    humanOutcome: false,
    heldOut: false,
    evidenceClass: "controlled-synthetic-corpus-integrity",
    robustnessReplay: false,
    cellCounts,
    familyCounts,
    peakRssBytes: 1,
    wallTimeMs: 1,
    recordSizeLimitBytes: 16_384,
    absoluteWriterByteCeiling: 1_610_612_736,
    peakRssLimitBytes: 536_870_912,
    tierTimeLimitMs: 300_000,
  };
}

describe("closed manifest parser", () => {
  it("rejects unknown, missing, and opposite provenance fields", () => {
    const valid = manifestFixture();
    expect(() => assertManifest(valid)).not.toThrow();
    expect(() => assertManifest({ ...valid, unknown: true })).toThrow(/keys are not exact/);
    const { evidenceClass: _evidenceClass, ...missing } = valid;
    expect(() => assertManifest(missing)).toThrow(/keys are not exact/);
    expect(() => assertManifest({ ...valid, organicEvidence: true })).toThrow(/provenance/);
  });
});

describe("safe ignored-path boundary", () => {
  it("rejects home expansion and paths outside .muse-dev/eval-data", async () => {
    await expect(resolveSafeEvalPath("~/.muse/eval-data/v1/1000")).rejects.toThrow(/Unsafe/);
    await expect(resolveSafeEvalPath("docs/benchmarks/records.jsonl")).rejects.toThrow(/below/);
  });

  it("rejects an existing symlink in the path", async () => {
    const base = resolve(process.cwd(), ".muse-dev", "eval-data", "v1", `.symlink-test-${process.pid}-${Date.now()}`);
    cleanup.push(base);
    await mkdir(base, { recursive: true, mode: 0o700 });
    await symlink(resolve(process.cwd(), ".muse-dev"), resolve(base, "link"));
    await expect(resolveSafeEvalPath(resolve(base, "link", "records.jsonl"))).rejects.toThrow(/Symlink/);
  });
});
