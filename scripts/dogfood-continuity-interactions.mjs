#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CLI_PROGRAM = join(ROOT, "apps/cli/dist/program.js");
const THREAD_KINDS = ["life", "work"];
const INTERACTION_STATES = ["exact", "none", "unavailable"];

export function buildContinuityShadowCorpusPlan(casesPerCell = 4) {
  if (!Number.isSafeInteger(casesPerCell) || casesPerCell < 1) throw new Error("casesPerCell must be a positive safe integer");
  return THREAD_KINDS.flatMap((threadKind) => INTERACTION_STATES.flatMap((expectedState) =>
    Array.from({ length: casesPerCell }, (_, index) => ({
      caseId: `${threadKind}-${expectedState}-${(index + 1).toString()}`,
      expectedState,
      threadKind
    }))));
}

export function validateContinuityInteractionShadowArtifact(artifact, casesPerCell = 4) {
  const expectedTotal = casesPerCell * THREAD_KINDS.length * INTERACTION_STATES.length;
  const expectedPerState = casesPerCell * THREAD_KINDS.length;
  if (artifact?.schema !== "muse.continuity-interaction-shadow/v1") throw new Error("unexpected shadow artifact schema");
  if (artifact.classification !== "controlled-same-session" || artifact.naturalLongitudinalEvidence !== false) {
    throw new Error("controlled evidence must not be represented as natural longitudinal evidence");
  }
  if (artifact.corpus?.deliveries !== expectedTotal || artifact.corpus?.casesPerCell !== casesPerCell) {
    throw new Error("shadow corpus size does not match the fixed matrix");
  }
  const slices = [artifact.digest?.overall, artifact.digest?.byThreadKind?.life, artifact.digest?.byThreadKind?.work];
  if (slices.some((slice) => !slice)) throw new Error("shadow digest is missing an aggregate slice");
  for (const slice of slices) {
    const counts = INTERACTION_STATES.map((state) => slice.states?.[state]?.count);
    if (counts.some((count) => !Number.isSafeInteger(count) || count < 0) || counts.reduce((sum, count) => sum + count, 0) !== slice.totalDeliveries) {
      throw new Error("shadow digest state counts do not conserve the delivery total");
    }
    for (const state of INTERACTION_STATES) {
      const expectedRatio = slice.totalDeliveries === 0 ? 0 : slice.states[state].count / slice.totalDeliveries;
      if (!Number.isFinite(slice.states[state].ratio) || slice.states[state].ratio !== expectedRatio) {
        throw new Error("shadow digest state ratios do not match their counts");
      }
    }
    const latency = slice.completionLatencyMs;
    if (latency?.sampleSize !== slice.states.exact.count) throw new Error("latency sample count must equal exact receipt count");
    if (latency.sampleSize === 0) {
      if ([latency.minMs, latency.medianMs, latency.p95Ms, latency.maxMs].some((value) => value !== null)) {
        throw new Error("zero latency samples require null statistics");
      }
    } else if (![latency.minMs, latency.medianMs, latency.p95Ms, latency.maxMs].every((value) => Number.isSafeInteger(value) && value >= 0)
      || latency.minMs > latency.medianMs || latency.medianMs > latency.p95Ms || latency.p95Ms > latency.maxMs) {
      throw new Error("latency statistics are invalid or out of order");
    }
  }
  if (artifact.digest.overall.totalDeliveries !== expectedTotal) throw new Error("overall delivery total does not match the corpus");
  for (const state of INTERACTION_STATES) {
    if (artifact.digest.overall.states?.[state]?.count !== expectedPerState) throw new Error(`overall ${state} count does not match the corpus`);
  }
  for (const kind of THREAD_KINDS) {
    const slice = artifact.digest.byThreadKind[kind];
    if (slice.totalDeliveries !== casesPerCell * INTERACTION_STATES.length) throw new Error(`${kind} delivery total does not match the corpus`);
    for (const state of INTERACTION_STATES) {
      if (slice.states?.[state]?.count !== casesPerCell) throw new Error(`${kind}/${state} cell does not match the corpus`);
    }
  }
  if (artifact.digest.overall.completionLatencyMs?.sampleSize !== expectedPerState) throw new Error("latency samples must come only from exact receipts");
  if (artifact.invariants?.explicitOutcomes !== 0) throw new Error("shadow interaction evidence must not create outcomes");
  if (artifact.invariants?.interactionReceipts !== expectedPerState) throw new Error("exact receipt count does not match the corpus");
  if (artifact.invariants?.readOnlyReportBytesUnchanged !== true || artifact.invariants?.replayReceiptCountUnchanged !== true) {
    throw new Error("report reads and exact replays must be mutation-free");
  }
  if (artifact.invariants?.ownerOnlyFiles !== true || artifact.invariants?.permissionOrGrantFields !== 0) {
    throw new Error("shadow evidence violated its storage or permission boundary");
  }
  return artifact;
}

export async function runContinuityInteractionShadowDogfood({ casesPerCell = 4, keep = false, progress = () => undefined } = {}) {
  const startedAt = new Date();
  const dir = await mkdtemp(join(tmpdir(), "muse-continuity-shadow-"));
  const attunementFile = join(dir, "attunement.json");
  const notesDir = join(dir, "notes");
  const tasksFile = join(dir, "tasks.json");
  await mkdir(notesDir, { mode: 0o700 });
  const previousEnv = {
    HOME: process.env.HOME,
    MUSE_ATTUNEMENT_FILE: process.env.MUSE_ATTUNEMENT_FILE,
    MUSE_NOTES_DIR: process.env.MUSE_NOTES_DIR,
    MUSE_TASKS_FILE: process.env.MUSE_TASKS_FILE
  };
  process.env.HOME = dir;
  process.env.MUSE_ATTUNEMENT_FILE = attunementFile;
  process.env.MUSE_NOTES_DIR = notesDir;
  process.env.MUSE_TASKS_FILE = tasksFile;
  const { createProgram } = await import(pathToFileURL(CLI_PROGRAM).href);
  const runCli = async (args) => {
    const stdout = [];
    const stderr = [];
    const program = createProgram({
      stderr: (line) => stderr.push(line),
      stdout: (line) => stdout.push(line)
    });
    program.exitOverride();
    try {
      await program.parseAsync(["node", "muse", ...args]);
    } catch (cause) {
      throw new Error(`muse ${args.join(" ")} failed: ${stderr.join("").trim() || (cause instanceof Error ? cause.message : String(cause))}`);
    }
    if (stderr.join("").trim().length > 0) throw new Error(`muse ${args.join(" ")} wrote stderr: ${stderr.join("").trim()}`);
    return stdout.join("");
  };

  try {
    const plan = buildContinuityShadowCorpusPlan(casesPerCell);
    const exactTaskIds = [];
    for (const entry of plan) {
      progress(`dogfood:continuity-interactions — ${entry.caseId}`);
      const task = JSON.parse(await runCli(["tasks", "add", `Shadow ${entry.caseId}`, "--local", "--json"]));
      const started = await runCli(["thread", "start", "Shadow", entry.caseId, "--kind", entry.threadKind]);
      const threadId = started.match(/Started (?:life|work) thread ([^:]+):/u)?.[1];
      if (typeof task.id !== "string" || !threadId) throw new Error(`could not resolve public CLI identities for ${entry.caseId}`);
      await runCli(["thread", "link", threadId, "task", task.id, "--role", "next-step"]);
      await runCli(["thread", "continue", threadId]);
      if (entry.expectedState === "exact") {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await runCli(["tasks", "complete", task.id, "--local", "--json"]);
        exactTaskIds.push(task.id);
      } else if (entry.expectedState === "unavailable") {
        await runCli(["thread", "unlink", threadId, "task", task.id]);
      }
    }

    const beforeReplay = JSON.parse(await readFile(attunementFile, "utf8"));
    for (const taskId of exactTaskIds) await runCli(["tasks", "complete", taskId, "--local", "--json"]);
    const afterReplay = JSON.parse(await readFile(attunementFile, "utf8"));
    const replayReceiptCountUnchanged = beforeReplay.interactionReceipts.length === afterReplay.interactionReceipts.length;

    const beforeReport = await readFile(attunementFile);
    const report = JSON.parse(await runCli(["thread", "interactions", "--json"]));
    const afterReport = await readFile(attunementFile);
    const persisted = JSON.parse(afterReport.toString("utf8"));
    const taskMode = (await stat(tasksFile)).mode & 0o777;
    const attunementMode = (await stat(attunementFile)).mode & 0o777;
    const serialized = JSON.stringify(persisted);
    const artifact = {
      classification: "controlled-same-session",
      commandPath: "built Muse CLI command graph",
      corpus: { casesPerCell, deliveries: plan.length },
      digest: report.digest,
      durationMs: Date.now() - startedAt.getTime(),
      finishedAt: new Date().toISOString(),
      invariants: {
        explicitOutcomes: persisted.deliveries.filter((delivery) => delivery.outcome !== undefined).length,
        interactionReceipts: persisted.interactionReceipts.length,
        ownerOnlyFiles: taskMode === 0o600 && attunementMode === 0o600,
        permissionOrGrantFields: (serialized.match(/"(?:permission|grant)\w*"/giu) ?? []).length,
        readOnlyReportBytesUnchanged: createHash("sha256").update(beforeReport).digest("hex") === createHash("sha256").update(afterReport).digest("hex"),
        replayReceiptCountUnchanged
      },
      naturalLongitudinalEvidence: false,
      schema: "muse.continuity-interaction-shadow/v1",
      startedAt: startedAt.toISOString()
    };
    return validateContinuityInteractionShadowArtifact(artifact, casesPerCell);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (!keep) await rm(dir, { force: true, recursive: true });
  }
}

if (process.argv.includes("--dogfood-run")) {
  try {
    const artifact = await runContinuityInteractionShadowDogfood({ progress: (message) => process.stderr.write(`${message}\n`) });
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  } catch (cause) {
    process.stderr.write(`dogfood:continuity-interactions FAIL — ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
