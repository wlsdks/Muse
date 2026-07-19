import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";

export const GENERATOR_VERSION = "v1" as const;
export const SCHEMA_VERSION = 1 as const;
export const EVIDENCE_CLASS = "controlled-synthetic-corpus-integrity" as const;
export const SYNTHETIC_PROVENANCE = {
  dataOrigin: "synthetic" as const,
  organicEvidence: false as const,
  personalLearningEligible: false as const,
  humanOutcome: false as const,
  heldOut: false as const,
  evidenceClass: EVIDENCE_CLASS,
  robustnessReplay: false as const,
};
export const ROBUSTNESS_REPLAY_SEED = 520_057;
export const TIERS = [1_000, 10_000, 100_000, 1_000_000] as const;
export const FAMILIES = [
  "recall-correction",
  "absent-abstention",
  "continuity",
  "memory-preference-veto-correction",
  "tool-policy-approval",
  "context-stress",
] as const;
export const LOCALES = ["en", "ko", "ja", "zh-CN"] as const;
export const COMPLEXITIES = ["simple", "medium", "complex", "long-context"] as const;

export type Tier = (typeof TIERS)[number];
export type Family = (typeof FAMILIES)[number];
export type Locale = (typeof LOCALES)[number];
export type Complexity = (typeof COMPLEXITIES)[number];

type CommonRecord = {
  schemaVersion: typeof SCHEMA_VERSION;
  generatorVersion: typeof GENERATOR_VERSION;
  recordId: string;
  sequence: number;
  tier: Tier;
  seed: number;
  family: Family;
  locale: Locale;
  complexity: Complexity;
  dataOrigin: "synthetic";
  organicEvidence: false;
  personalLearningEligible: false;
  humanOutcome: false;
  heldOut: false;
  evidenceClass: typeof EVIDENCE_CLASS;
  robustnessReplay: boolean;
  topicHash: string;
  contentHash: string;
};

export type RecallCorrectionRecord = CommonRecord & {
  family: "recall-correction";
  payload: {
    templateId: string;
    lexemeId: string;
    scenarioId: string;
    query: string;
    current: string;
    stale: string;
    distractor: string;
  };
  expected: { terminal: "current-before-stale" };
};

export type AbsentAbstentionRecord = CommonRecord & {
  family: "absent-abstention";
  payload: {
    templateId: string;
    lexemeId: string;
    scenarioId: string;
    query: string;
    corpus: string;
  };
  expected: { terminal: "abstain" };
};

export type ContinuityRecord = CommonRecord & {
  family: "continuity";
  payload: {
    templateId: string;
    lexemeId: string;
    scenarioId: string;
    threadTitle: string;
    artifactTitle: string;
  };
  expected: { terminal: "controlled-excluded-from-next" };
};

export type MemoryRecord = CommonRecord & {
  family: "memory-preference-veto-correction";
  payload: {
    templateId: string;
    lexemeId: string;
    scenarioId: string;
    operation: "add" | "update" | "delete" | "noop";
    key: string;
    existing: string;
    incoming: string;
  };
  expected: { terminal: "memory-operation"; operation: "add" | "update" | "delete" | "noop" };
};

export type ToolPolicyRecord = CommonRecord & {
  family: "tool-policy-approval";
  payload: {
    templateId: string;
    lexemeId: string;
    scenarioId: string;
    action: string;
    authorityStatus: "missing" | "expired" | "revoked" | "valid";
    hardDeny: true;
  };
  expected: { terminal: "deny" };
};

export type ContextStressRecord = CommonRecord & {
  family: "context-stress";
  payload: {
    templateId: string;
    lexemeId: string;
    scenarioId: string;
    messages: string[];
    maxContextWindowTokens: number;
    outputReserveTokens: number;
  };
  expected: { terminal: "within-budget"; trimmingRequired: boolean };
};

export type EvalRecord =
  | RecallCorrectionRecord
  | AbsentAbstentionRecord
  | ContinuityRecord
  | MemoryRecord
  | ToolPolicyRecord
  | ContextStressRecord;

export type CellCounts = Record<string, number>;

export type TierManifest = {
  schemaVersion: typeof SCHEMA_VERSION;
  generatorVersion: typeof GENERATOR_VERSION;
  tier: Tier;
  seed: number;
  recordsFile: "records.jsonl";
  recordCount: number;
  serializedCount: number;
  bytes: number;
  corpusSha256: string;
  dataOrigin: "synthetic";
  organicEvidence: false;
  personalLearningEligible: false;
  humanOutcome: false;
  heldOut: false;
  evidenceClass: typeof EVIDENCE_CLASS;
  robustnessReplay: boolean;
  cellCounts: CellCounts;
  familyCounts: Record<Family, number>;
  peakRssBytes: number;
  wallTimeMs: number;
  recordSizeLimitBytes: 16_384;
  absoluteWriterByteCeiling: 1_610_612_736;
  peakRssLimitBytes: 536_870_912;
  tierTimeLimitMs: 300_000;
};

export type ValidationResult = {
  dataOrigin: "synthetic";
  organicEvidence: false;
  personalLearningEligible: false;
  humanOutcome: false;
  heldOut: false;
  evidenceClass: typeof EVIDENCE_CLASS;
  robustnessReplay: boolean;
  manifest: TierManifest;
  generated: number;
  serialized: number;
  parsedAndSchemaValidated: number;
  collisionCounts: { recordId: 0; topicHash: 0; contentHash: 0 };
  sample: EvalRecord[];
  peakRssBytes: number;
  wallTimeMs: number;
};

const SCALE_SEEDS: Record<Tier, number> = {
  1_000: 120_031,
  10_000: 220_033,
  100_000: 320_039,
  1_000_000: 420_041,
};
export { SCALE_SEEDS };

const LEXICONS: Record<Locale, readonly string[]> = {
  en: ["Aster Kiln", "Morrow Orchard", "Juniper Relay", "Cobalt Harbor"],
  ko: ["별꽃 가마", "모로 과수원", "향나무 중계", "코발트 항구"],
  ja: ["アスター窯", "モロウ果樹園", "ジュニパー中継", "コバルト港"],
  "zh-CN": ["星菊窑", "莫罗果园", "杜松中继", "钴蓝港"],
};

const MEMORY_OPERATIONS = ["add", "update", "delete", "noop"] as const;
const AUTHORITY_STATUSES = ["missing", "expired", "revoked", "valid"] as const;
const CELL_COUNT = FAMILIES.length * LOCALES.length * COMPLEXITIES.length;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function cellKey(family: Family, locale: Locale, complexity: Complexity): string {
  return `${family}|${locale}|${complexity}`;
}

function decodeCell(sequence: number, seed: number): {
  family: Family;
  locale: Locale;
  complexity: Complexity;
  cycle: number;
} {
  const cell = (sequence + Math.abs(seed % CELL_COUNT)) % CELL_COUNT;
  const family = FAMILIES[Math.floor(cell / (LOCALES.length * COMPLEXITIES.length))]!;
  const withinFamily = cell % (LOCALES.length * COMPLEXITIES.length);
  const locale = LOCALES[Math.floor(withinFamily / COMPLEXITIES.length)]!;
  const complexity = COMPLEXITIES[withinFamily % COMPLEXITIES.length]!;
  return { family, locale, complexity, cycle: Math.floor(sequence / CELL_COUNT) };
}

type LocalizedTemplates = {
  marker: (lexeme: string, scenarioId: string, complexity: Complexity) => string;
  recallQuery: (marker: string) => string;
  current: (marker: string) => string;
  stale: (marker: string) => string;
  distractor: (scenarioId: string) => string;
  absentQuery: (marker: string) => string;
  absentCorpus: (scenarioId: string) => string;
  thread: (marker: string) => string;
  artifact: (scenarioId: string) => string;
  existing: (marker: string) => string;
  incoming: (marker: string) => string;
  retraction: string;
  context: (turn: number, marker: string) => string;
};

function complexityLabel(locale: Locale, complexity: Complexity): string {
  const labels: Record<Locale, Record<Complexity, string>> = {
    en: { simple: "one step", medium: "two linked steps", complex: "three constraints", "long-context": "a long-running work thread" },
    ko: { simple: "한 단계", medium: "이어진 두 단계", complex: "세 가지 제약", "long-context": "오래 이어진 업무 흐름" },
    ja: { simple: "一段階", medium: "連続する二段階", complex: "三つの制約", "long-context": "長く続く仕事の流れ" },
    "zh-CN": { simple: "单一步骤", medium: "两个连续步骤", complex: "三项约束", "long-context": "持续较久的工作脉络" },
  };
  return labels[locale][complexity];
}

const TEMPLATES: Record<Locale, LocalizedTemplates> = {
  en: {
    marker: (lexeme, scenarioId, complexity) => `${lexeme} ${scenarioId}, ${complexityLabel("en", complexity)}`,
    recallQuery: (marker) => `Which revision is current for the work plan at ${marker}?`,
    current: (marker) => `The accepted current work revision for ${marker} keeps the cobalt milestone.`,
    stale: (marker) => `This superseded work revision for ${marker} used the earlier violet milestone.`,
    distractor: (scenarioId) => `A fictional home-garden rehearsal for ${scenarioId} mentions quartz.` ,
    absentQuery: (marker) => `What is the confirmed household delivery window for ${marker}?`,
    absentCorpus: (scenarioId) => `The fictional work almanac for ${scenarioId} only describes a violet rehearsal.`,
    thread: (marker) => `Continue the shared work plan for ${marker}`,
    artifact: (scenarioId) => `Review the next fictional task for ${scenarioId}`,
    existing: (marker) => `Prefer a quiet morning review for ${marker}.`,
    incoming: (marker) => `Prefer a focused afternoon review for ${marker}.`,
    retraction: "forget this preference",
    context: (turn, marker) => `Synthetic work turn ${turn}: keep the next step for ${marker} explicit.`,
  },
  ko: {
    marker: (lexeme, scenarioId, complexity) => `${lexeme} ${scenarioId}의 ${complexityLabel("ko", complexity)}`,
    recallQuery: (marker) => `${marker} 업무 계획에서 현재 확정된 개정안은 무엇인가요?`,
    current: (marker) => `${marker} 업무의 최신 확정안은 코발트 이정표를 유지합니다.`,
    stale: (marker) => `${marker} 업무의 이전 폐기안은 바이올렛 이정표를 사용했습니다.`,
    distractor: (scenarioId) => `${scenarioId}의 가상 생활 정원 연습에는 석영 이야기가 나옵니다.`,
    absentQuery: (marker) => `${marker} 생활 물품의 확정 배송 시간은 언제인가요?`,
    absentCorpus: (scenarioId) => `${scenarioId}의 가상 업무 기록에는 바이올렛 연습만 적혀 있습니다.`,
    thread: (marker) => `${marker} 공동 업무 계획 이어가기`,
    artifact: (scenarioId) => `${scenarioId}의 다음 가상 할 일 검토`,
    existing: (marker) => `${marker} 검토는 조용한 아침을 선호합니다.`,
    incoming: (marker) => `${marker} 검토는 집중할 수 있는 오후를 선호합니다.`,
    retraction: "이 선호를 잊어줘",
    context: (turn, marker) => `합성 업무 대화 ${turn}: ${marker}의 다음 단계를 명확히 유지합니다.`,
  },
  ja: {
    marker: (lexeme, scenarioId, complexity) => `${lexeme} ${scenarioId}の${complexityLabel("ja", complexity)}`,
    recallQuery: (marker) => `${marker}の仕事計画で現在確定している改訂版はどれですか。`,
    current: (marker) => `${marker}の最新確定版はコバルトの節目を維持します。`,
    stale: (marker) => `${marker}の廃止済み旧版はバイオレットの節目を使っていました。`,
    distractor: (scenarioId) => `${scenarioId}の架空の暮らしの庭仕事には石英の話が出ます。`,
    absentQuery: (marker) => `${marker}の生活用品について確定した配達時間はいつですか。`,
    absentCorpus: (scenarioId) => `${scenarioId}の架空の仕事記録にはバイオレットの練習だけがあります。`,
    thread: (marker) => `${marker}の共同作業計画を続ける`,
    artifact: (scenarioId) => `${scenarioId}の次の架空タスクを確認する`,
    existing: (marker) => `${marker}の確認は静かな朝を好みます。`,
    incoming: (marker) => `${marker}の確認は集中できる午後を好みます。`,
    retraction: "この好みを忘れて",
    context: (turn, marker) => `合成された仕事の会話 ${turn}: ${marker}の次の手順を明確に保ちます。`,
  },
  "zh-CN": {
    marker: (lexeme, scenarioId, complexity) => `${lexeme} ${scenarioId}的${complexityLabel("zh-CN", complexity)}`,
    recallQuery: (marker) => `${marker}工作计划中当前确认的修订版是哪一个？`,
    current: (marker) => `${marker}工作的最新确认版本保留钴蓝里程碑。`,
    stale: (marker) => `${marker}工作中已废弃的旧版本使用紫罗兰里程碑。`,
    distractor: (scenarioId) => `${scenarioId}的虚构生活园艺记录提到了石英。`,
    absentQuery: (marker) => `${marker}生活用品已确认的配送时间是什么？`,
    absentCorpus: (scenarioId) => `${scenarioId}的虚构工作记录只描述了紫罗兰排练。`,
    thread: (marker) => `继续推进${marker}的协作工作计划`,
    artifact: (scenarioId) => `检查${scenarioId}的下一个虚构任务`,
    existing: (marker) => `${marker}的复盘偏好安静的上午。`,
    incoming: (marker) => `${marker}的复盘偏好专注的下午。`,
    retraction: "忘记这项偏好",
    context: (turn, marker) => `合成工作对话 ${turn}：明确保留${marker}的下一步。`,
  },
};

type RecordWithoutHash = Omit<EvalRecord, "contentHash">;

export function generateRecord(tier: Tier, seed: number, sequence: number, options: { robustnessReplay?: boolean } = {}): EvalRecord {
  if (!TIERS.includes(tier) || !Number.isSafeInteger(seed) || !Number.isInteger(sequence) || sequence < 0 || sequence >= tier) {
    throw new Error("Invalid tier, seed, or sequence");
  }
  const { family, locale, complexity, cycle } = decodeCell(sequence, seed);
  const lexemeIndex = Math.abs((cycle + seed) % LEXICONS[locale].length);
  const lexeme = LEXICONS[locale][lexemeIndex]!;
  const lexemeId = `${locale}-${lexemeIndex}`;
  const templateId = `${family}-${locale}-${complexity}`;
  const scenarioId = `scenario-${Math.abs(seed)}-${cycle}`;
  const templates = TEMPLATES[locale];
  const marker = templates.marker(lexeme, scenarioId, complexity);
  const common = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    recordId: "",
    sequence,
    tier,
    seed,
    family,
    locale,
    complexity,
    dataOrigin: "synthetic" as const,
    organicEvidence: false as const,
    personalLearningEligible: false as const,
    humanOutcome: false as const,
    heldOut: false as const,
    evidenceClass: EVIDENCE_CLASS,
    robustnessReplay: options.robustnessReplay === true,
    topicHash: "",
  };
  let withoutHash: RecordWithoutHash;
  switch (family) {
    case "recall-correction":
      withoutHash = {
        ...common,
        family,
        payload: {
          templateId,
          lexemeId,
          scenarioId,
          query: templates.recallQuery(marker),
          current: templates.current(marker),
          stale: templates.stale(marker),
          distractor: templates.distractor(scenarioId),
        },
        expected: { terminal: "current-before-stale" },
      };
      break;
    case "absent-abstention":
      {
      const unrelatedArchiveId = `archive-${sha256(`absent\0${seed}\0${cycle}\0${locale}`).slice(0, 12)}`;
      withoutHash = {
        ...common,
        family,
        payload: {
          templateId,
          lexemeId,
          scenarioId,
          query: templates.absentQuery(marker),
          corpus: templates.absentCorpus(unrelatedArchiveId),
        },
        expected: { terminal: "abstain" },
      };
      break;
      }
    case "continuity":
      withoutHash = {
        ...common,
        family,
        payload: {
          templateId,
          lexemeId,
          scenarioId,
          threadTitle: templates.thread(marker),
          artifactTitle: templates.artifact(scenarioId),
        },
        expected: { terminal: "controlled-excluded-from-next" },
      };
      break;
    case "memory-preference-veto-correction": {
      const operation = MEMORY_OPERATIONS[(cycle + lexemeIndex) % MEMORY_OPERATIONS.length]!;
      const existing = templates.existing(marker);
      const incoming = operation === "noop" ? existing : operation === "delete" ? templates.retraction : templates.incoming(marker);
      withoutHash = {
        ...common,
        family,
        payload: {
          templateId,
          lexemeId,
          scenarioId,
          operation,
          key: `fictional-preference-${lexemeId}-${cycle}`,
          existing,
          incoming,
        },
        expected: { terminal: "memory-operation", operation },
      };
      break;
    }
    case "tool-policy-approval":
      withoutHash = {
        ...common,
        family,
        payload: {
          templateId,
          lexemeId,
          scenarioId,
          action: `fictional.task.transition.${cycle}`,
          authorityStatus: AUTHORITY_STATUSES[(cycle + lexemeIndex) % AUTHORITY_STATUSES.length]!,
          hardDeny: true,
        },
        expected: { terminal: "deny" },
      };
      break;
    case "context-stress": {
      const messageCount = complexity === "long-context" ? 32 : complexity === "complex" ? 8 : complexity === "medium" ? 4 : 2;
      withoutHash = {
        ...common,
        family,
        payload: {
          templateId,
          lexemeId,
          scenarioId,
          messages: Array.from({ length: messageCount }, (_, index) => templates.context(index, marker)),
          maxContextWindowTokens: 512,
          outputReserveTokens: 128,
        },
        expected: { terminal: "within-budget", trimmingRequired: complexity === "long-context" },
      };
      break;
    }
  }
  const semantic = {
    family,
    locale,
    complexity,
    payload: withoutHash.payload,
    expected: withoutHash.expected,
  };
  const topicHash = sha256(JSON.stringify({ family, locale, complexity, templateId, lexemeId, scenarioId }));
  const contentHash = sha256(JSON.stringify(semantic));
  const recordId = `eval-${GENERATOR_VERSION}-${tier}-${seed}-${sequence}-${contentHash.slice(0, 12)}`;
  return { ...withoutHash, recordId, topicHash, contentHash } as EvalRecord;
}

export function assertExactSyntheticRecord(value: unknown): asserts value is EvalRecord {
  if (!value || typeof value !== "object") throw new Error("Record must be an object");
  const candidate = value as Partial<EvalRecord>;
  if (candidate.dataOrigin !== "synthetic" || candidate.organicEvidence !== false || candidate.personalLearningEligible !== false || candidate.humanOutcome !== false || candidate.heldOut !== false || candidate.evidenceClass !== EVIDENCE_CLASS || typeof candidate.robustnessReplay !== "boolean") {
    throw new Error("Synthetic provenance and non-learning fields must be explicit and fail closed");
  }
  if (!TIERS.includes(candidate.tier as Tier) || !Number.isSafeInteger(candidate.seed) || !Number.isInteger(candidate.sequence)) {
    throw new Error("Record identity fields are invalid");
  }
  const expected = generateRecord(candidate.tier as Tier, candidate.seed as number, candidate.sequence as number, { robustnessReplay: candidate.robustnessReplay });
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error("Record is not an exact member of the fixed fictional generator allowlist");
  }
  const encoded = Buffer.byteLength(`${JSON.stringify(value)}\n`, "utf8");
  if (encoded > 16_384) throw new Error(`Record exceeds 16 KiB: ${encoded}`);
}

export function expectedCellCounts(tier: Tier, seed: number): CellCounts {
  const counts: CellCounts = {};
  for (const family of FAMILIES) for (const locale of LOCALES) for (const complexity of COMPLEXITIES) counts[cellKey(family, locale, complexity)] = 0;
  for (let sequence = 0; sequence < tier; sequence += 1) {
    const decoded = decodeCell(sequence, seed);
    const key = cellKey(decoded.family, decoded.locale, decoded.complexity);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertNoExistingSymlink(path: string, stopAt: string): Promise<void> {
  let cursor = resolve(path);
  const floor = resolve(stopAt);
  const pending: string[] = [];
  while (cursor.startsWith(floor) && cursor !== dirname(cursor)) {
    pending.push(cursor);
    if (cursor === floor) break;
    cursor = dirname(cursor);
  }
  for (const entry of pending.reverse()) {
    if (await pathExists(entry)) {
      const info = await lstat(entry);
      if (info.isSymbolicLink()) throw new Error(`Symlink paths are forbidden: ${relative(process.cwd(), entry)}`);
    }
  }
}

export async function resolveSafeEvalPath(rawPath: string, cwd = process.cwd()): Promise<string> {
  if (!rawPath || rawPath.includes("~") || rawPath.includes("\0")) throw new Error("Unsafe evaluation-data path");
  const workspace = resolve(cwd);
  const allowedRoot = resolve(workspace, ".muse-dev", "eval-data");
  const target = resolve(workspace, rawPath);
  if (target === allowedRoot || !target.startsWith(`${allowedRoot}${sep}`)) {
    throw new Error("Evaluation data must be below .muse-dev/eval-data/");
  }
  await assertNoExistingSymlink(target, workspace);
  return target;
}

async function writeJsonAtomic(path: string, value: unknown, mode: number): Promise<void> {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode, flag: "wx" });
  await chmod(temp, mode);
  await rename(temp, path);
}

function newFamilyCounts(): Record<Family, number> {
  return Object.fromEntries(FAMILIES.map((family) => [family, 0])) as Record<Family, number>;
}

export async function generateTier(options: { tier: Tier; seed: number; out: string; cwd?: string; robustnessReplay?: boolean }): Promise<string> {
  const started = performance.now();
  const cwd = options.cwd ?? process.cwd();
  const out = await resolveSafeEvalPath(options.out, cwd);
  const mainLayout = basename(out) === String(options.tier) && basename(dirname(out)) === GENERATOR_VERSION;
  const replayLayout = basename(out) === String(options.tier) && basename(dirname(out)).startsWith("robustness-") && basename(dirname(dirname(out))) === GENERATOR_VERSION;
  if ((!options.robustnessReplay && !mainLayout) || (options.robustnessReplay && !replayLayout)) {
    throw new Error(options.robustnessReplay ? `Replay output must be .muse-dev/eval-data/${GENERATOR_VERSION}/robustness-<run>/${options.tier}` : `Output must be .muse-dev/eval-data/${GENERATOR_VERSION}/${options.tier}`);
  }
  if (await pathExists(out)) throw new Error(`Output already exists: ${relative(cwd, out)}`);
  await mkdir(dirname(out), { recursive: true, mode: 0o700 });
  await chmod(dirname(out), 0o700);
  const tempDir = `${out}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(tempDir, { mode: 0o700 });
  const recordsPath = resolve(tempDir, "records.jsonl");
  const stream = createWriteStream(recordsPath, { encoding: "utf8", flags: "wx", mode: 0o600 });
  const digest = createHash("sha256");
  const cellCounts = expectedCellCounts(options.tier, options.seed);
  const familyCounts = newFamilyCounts();
  let bytes = 0;
  let peakRssBytes = process.memoryUsage().rss;
  try {
    for (let sequence = 0; sequence < options.tier; sequence += 1) {
      const record = generateRecord(options.tier, options.seed, sequence, { robustnessReplay: options.robustnessReplay });
      const line = `${JSON.stringify(record)}\n`;
      const lineBytes = Buffer.byteLength(line, "utf8");
      if (lineBytes > 16_384) throw new Error(`Record ${record.recordId} exceeds 16 KiB`);
      bytes += lineBytes;
      if (bytes > 1_610_612_736) throw new Error("Tier exceeds the 1.5 GiB cap");
      digest.update(line, "utf8");
      familyCounts[record.family] += 1;
      if (!stream.write(line)) await new Promise<void>((resolveDrain) => stream.once("drain", resolveDrain));
      if (sequence % 4_096 === 0) peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      if (peakRssBytes > 536_870_912) throw new Error("Generation exceeded the 512 MiB RSS cap");
      if (performance.now() - started > 300_000) throw new Error("Generation exceeded the five-minute tier cap");
    }
    await new Promise<void>((resolveEnd, rejectEnd) => {
      stream.once("error", rejectEnd);
      stream.end(resolveEnd);
    });
    await chmod(recordsPath, 0o600);
    const wallTimeMs = Math.round(performance.now() - started);
    const manifest: TierManifest = {
      schemaVersion: SCHEMA_VERSION,
      generatorVersion: GENERATOR_VERSION,
      tier: options.tier,
      seed: options.seed,
      recordsFile: "records.jsonl",
      recordCount: options.tier,
      serializedCount: options.tier,
      bytes,
      corpusSha256: digest.digest("hex"),
      dataOrigin: "synthetic",
      organicEvidence: false,
      personalLearningEligible: false,
      humanOutcome: false,
      heldOut: false,
      evidenceClass: EVIDENCE_CLASS,
      robustnessReplay: options.robustnessReplay === true,
      cellCounts,
      familyCounts,
      peakRssBytes,
      wallTimeMs,
      recordSizeLimitBytes: 16_384,
      absoluteWriterByteCeiling: 1_610_612_736,
      peakRssLimitBytes: 536_870_912,
      tierTimeLimitMs: 300_000,
    };
    await writeJsonAtomic(resolve(tempDir, "manifest.json"), manifest, 0o600);
    await chmod(resolve(tempDir, "manifest.json"), 0o600);
    await rename(tempDir, out);
    return resolve(out, "manifest.json");
  } catch (error) {
    stream.destroy();
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export function assertExactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} keys are not exact`);
}

const MANIFEST_KEYS = [
  "schemaVersion", "generatorVersion", "tier", "seed", "recordsFile", "recordCount", "serializedCount", "bytes", "corpusSha256",
  "dataOrigin", "organicEvidence", "personalLearningEligible", "humanOutcome", "heldOut", "evidenceClass", "robustnessReplay",
  "cellCounts", "familyCounts", "peakRssBytes", "wallTimeMs", "recordSizeLimitBytes", "absoluteWriterByteCeiling", "peakRssLimitBytes", "tierTimeLimitMs",
] as const;

export function assertManifest(value: unknown): asserts value is TierManifest {
  if (!value || typeof value !== "object") throw new Error("Manifest must be an object");
  assertExactKeys(value, MANIFEST_KEYS, "Manifest");
  const manifest = value as Partial<TierManifest>;
  if (manifest.schemaVersion !== SCHEMA_VERSION || manifest.generatorVersion !== GENERATOR_VERSION || !TIERS.includes(manifest.tier as Tier) || !Number.isSafeInteger(manifest.seed)) throw new Error("Manifest identity is invalid");
  if (manifest.recordsFile !== "records.jsonl" || manifest.recordCount !== manifest.tier || manifest.serializedCount !== manifest.tier) throw new Error("Manifest count contract failed");
  if (manifest.dataOrigin !== "synthetic" || manifest.organicEvidence !== false || manifest.personalLearningEligible !== false || manifest.humanOutcome !== false || manifest.heldOut !== false || manifest.evidenceClass !== EVIDENCE_CLASS || typeof manifest.robustnessReplay !== "boolean") throw new Error("Manifest provenance contract failed");
  if (manifest.recordSizeLimitBytes !== 16_384 || manifest.absoluteWriterByteCeiling !== 1_610_612_736 || manifest.peakRssLimitBytes !== 536_870_912 || manifest.tierTimeLimitMs !== 300_000) throw new Error("Manifest resource contract failed");
  if (!Number.isSafeInteger(manifest.bytes) || (manifest.bytes as number) <= 0 || !Number.isFinite(manifest.peakRssBytes) || (manifest.peakRssBytes as number) <= 0 || !Number.isFinite(manifest.wallTimeMs) || (manifest.wallTimeMs as number) < 0) throw new Error("Manifest measured resources are invalid");
  if (typeof manifest.corpusSha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.corpusSha256)) throw new Error("Manifest digest is invalid");
  const expectedCells = expectedCellCounts(manifest.tier as Tier, manifest.seed as number);
  if (JSON.stringify(manifest.cellCounts) !== JSON.stringify(expectedCells)) throw new Error("Manifest does not cover the balanced 96-cell matrix");
  const expectedFamilies = newFamilyCounts();
  for (const [key, count] of Object.entries(expectedCells)) expectedFamilies[key.split("|")[0] as Family] += count;
  if (JSON.stringify(manifest.familyCounts) !== JSON.stringify(expectedFamilies)) throw new Error("Manifest family counts are not exact");
  const values = Object.values(expectedCells);
  if (Math.max(...values) - Math.min(...values) > 1) throw new Error("Cell allocation differs by more than one");
}

export class CollisionDatabase {
  readonly database: DatabaseSync;
  readonly insert: ReturnType<DatabaseSync["prepare"]>;
  private transactionOpen = false;
  private pending = 0;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE; CREATE TABLE seen(record_id TEXT UNIQUE NOT NULL, topic_hash TEXT UNIQUE NOT NULL, content_hash TEXT UNIQUE NOT NULL);");
    this.insert = this.database.prepare("INSERT INTO seen(record_id, topic_hash, content_hash) VALUES (?, ?, ?)");
  }

  add(record: EvalRecord): void {
    if (!this.transactionOpen) { this.database.exec("BEGIN"); this.transactionOpen = true; }
    try { this.insert.run(record.recordId, record.topicHash, record.contentHash); }
    catch { throw new Error(`Hash or record collision detected at ${record.recordId}`); }
    this.pending += 1;
    if (this.pending >= 10_000) this.flush();
  }

  flush(): void {
    if (this.transactionOpen) this.database.exec("COMMIT");
    this.transactionOpen = false;
    this.pending = 0;
  }

  close(): void { this.flush(); this.database.close(); }
}

export async function validateTier(manifestInput: string, options: { cwd?: string; collisionDatabase?: CollisionDatabase } = {}): Promise<ValidationResult> {
  const started = performance.now();
  const cwd = options.cwd ?? process.cwd();
  const manifestPath = await resolveSafeEvalPath(manifestInput, cwd);
  if (basename(manifestPath) !== "manifest.json") throw new Error("Expected a manifest.json path");
  const manifestMode = (await stat(manifestPath)).mode & 0o777;
  if (manifestMode !== 0o600) throw new Error(`Manifest mode must be 0600, got ${manifestMode.toString(8)}`);
  const manifestValue: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  assertManifest(manifestValue);
  const manifest = manifestValue;
  const tierDir = dirname(manifestPath);
  const mainLayout = basename(tierDir) === String(manifest.tier) && basename(dirname(tierDir)) === GENERATOR_VERSION;
  const replayLayout = basename(tierDir) === String(manifest.tier) && basename(dirname(tierDir)).startsWith("robustness-") && basename(dirname(dirname(tierDir))) === GENERATOR_VERSION;
  if ((!manifest.robustnessReplay && !mainLayout) || (manifest.robustnessReplay && !replayLayout)) throw new Error("Manifest is outside its canonical main or robustness-replay directory");
  const recordsPath = resolve(dirname(manifestPath), manifest.recordsFile);
  await assertNoExistingSymlink(recordsPath, resolve(cwd));
  const recordsMode = (await stat(recordsPath)).mode & 0o777;
  if (recordsMode !== 0o600) throw new Error(`Records mode must be 0600, got ${recordsMode.toString(8)}`);
  const ownedCollisionDir = options.collisionDatabase ? undefined : resolve(dirname(manifestPath), `.validate-run-${process.pid}-${Date.now()}`);
  if (ownedCollisionDir) await mkdir(ownedCollisionDir, { mode: 0o700 });
  const ownedCollisionDb = ownedCollisionDir ? resolve(ownedCollisionDir, "collisions.sqlite") : undefined;
  const collisionDatabase = options.collisionDatabase ?? new CollisionDatabase(ownedCollisionDb!);
  const digest = createHash("sha256");
  const sampleByCell = new Map<string, EvalRecord[]>();
  const counts: CellCounts = Object.fromEntries(Object.keys(manifest.cellCounts).map((key) => [key, 0]));
  let parsed = 0;
  let bytes = 0;
  let peakRssBytes = process.memoryUsage().rss;
  try {
    const lines = createInterface({ input: createReadStream(recordsPath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of lines) {
      if (line.length === 0) throw new Error(`Blank JSONL line at ${parsed + 1}`);
      const encodedLine = `${line}\n`;
      bytes += Buffer.byteLength(encodedLine, "utf8");
      digest.update(encodedLine, "utf8");
      const value: unknown = JSON.parse(line);
      assertExactSyntheticRecord(value);
      const record = value;
      if (record.sequence !== parsed || record.tier !== manifest.tier || record.seed !== manifest.seed || record.robustnessReplay !== manifest.robustnessReplay) throw new Error(`Record ordering, provenance, or manifest identity mismatch at ${parsed}`);
      collisionDatabase.add(record);
      const key = cellKey(record.family, record.locale, record.complexity);
      counts[key] = (counts[key] ?? 0) + 1;
      const cellSample = sampleByCell.get(key) ?? [];
      if (cellSample.length < 2) { cellSample.push(record); sampleByCell.set(key, cellSample); }
      parsed += 1;
      if (parsed % 4_096 === 0) peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      if (peakRssBytes > 536_870_912) throw new Error("Validation exceeded the 512 MiB RSS cap");
      if (performance.now() - started > 300_000) throw new Error("Validation exceeded the five-minute tier cap");
    }
    collisionDatabase.flush();
    if (parsed !== manifest.recordCount || parsed !== manifest.serializedCount) throw new Error(`Count mismatch: expected ${manifest.recordCount}, parsed ${parsed}`);
    if (bytes !== manifest.bytes || digest.digest("hex") !== manifest.corpusSha256) throw new Error("Corpus bytes or digest mismatch");
    if (JSON.stringify(counts) !== JSON.stringify(manifest.cellCounts)) throw new Error("Parsed 96-cell counts do not match the manifest");
    const sample = [...sampleByCell.values()].flat();
    if (sample.length !== Math.min(192, manifest.tier)) throw new Error(`Expected the stratified 2-per-cell sample, got ${sample.length}`);
    return {
      ...SYNTHETIC_PROVENANCE,
      robustnessReplay: manifest.robustnessReplay,
      manifest,
      generated: manifest.recordCount,
      serialized: manifest.serializedCount,
      parsedAndSchemaValidated: parsed,
      collisionCounts: { recordId: 0, topicHash: 0, contentHash: 0 },
      sample,
      peakRssBytes,
      wallTimeMs: Math.round(performance.now() - started),
    };
  } finally {
    if (!options.collisionDatabase) {
      collisionDatabase.close();
      await rm(ownedCollisionDir!, { recursive: true, force: true });
    }
  }
}

type OwnerEntry = { pathHash: string; kind: "directory" | "file" | "symlink"; mode: number; size: number; contentHash: string };

async function ownerEntries(root: string, current: string, entries: OwnerEntry[]): Promise<void> {
  const info = await lstat(current);
  const relativePath = relative(root, current) || ".";
  if (info.isSymbolicLink()) {
    entries.push({ pathHash: sha256(relativePath), kind: "symlink", mode: info.mode & 0o777, size: info.size, contentHash: "not-followed" });
    return;
  }
  if (info.isDirectory()) {
    entries.push({ pathHash: sha256(relativePath), kind: "directory", mode: info.mode & 0o777, size: info.size, contentHash: "directory" });
    const { readdir } = await import("node:fs/promises");
    for (const child of (await readdir(current)).sort()) await ownerEntries(root, resolve(current, child), entries);
    return;
  }
  entries.push({ pathHash: sha256(relativePath), kind: "file", mode: info.mode & 0o777, size: info.size, contentHash: sha256(await readFile(current)) });
}

export async function ownerMuseManifest(): Promise<{ exists: boolean; entryCount: number; digest: string }> {
  const root = resolve(homedir(), ".muse");
  if (!(await pathExists(root))) return { exists: false, entryCount: 0, digest: sha256("absent") };
  const entries: OwnerEntry[] = [];
  await ownerEntries(root, root, entries);
  return { exists: true, entryCount: entries.length, digest: sha256(JSON.stringify(entries)) };
}
