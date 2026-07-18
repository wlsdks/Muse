#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const RESTRICTED_EVIDENCE_KEYS = new Set([
  "artifactId",
  "content",
  "deliveryId",
  "explicitOutcome",
  "interaction",
  "interactions",
  "openedAt",
  "receipt",
  "runId",
  "threadId",
  "title"
]);

async function snapshot(file) {
  try {
    const bytes = await readFile(file);
    return { exists: true, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") {
      return { exists: false, sha256: null };
    }
    throw cause;
  }
}

function assertNoRestrictedEvidence(value) {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoRestrictedEvidence(entry);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (RESTRICTED_EVIDENCE_KEYS.has(key)) throw new Error(`aggregate artifact contains restricted evidence key '${key}'`);
    assertNoRestrictedEvidence(entry);
  }
}

export function validateLocalInteractionAuditArtifact(artifact) {
  if (artifact?.schema !== "muse.continuity-interaction-audit-local/v1") throw new Error("unexpected local audit schema");
  if (artifact.classification !== "actual-local-read-only" || artifact.syntheticDataUsed !== false) {
    throw new Error("local audit must remain actual and read-only");
  }
  if (artifact.naturalLongitudinalEvidence !== false || artifact.permissionExpansion !== false) {
    throw new Error("numeric local coverage must not certify natural evidence or permission");
  }
  for (const source of [artifact.files?.attunement, artifact.files?.tasks]) {
    if (!source || source.existsBefore !== source.existsAfter || source.sha256Unchanged !== true) {
      throw new Error("local source existence or bytes changed during the audit");
    }
  }
  assertNoRestrictedEvidence(artifact);
  return artifact;
}

export async function runLocalInteractionAudit({ env = process.env } = {}) {
  const [{ resolveAttunementFile, resolveTasksFile }, attunement] = await Promise.all([
    import(new URL("../packages/autoconfigure/dist/index.js", import.meta.url).href),
    import(new URL("../packages/attunement/dist/index.js", import.meta.url).href)
  ]);
  const attunementFile = resolveAttunementFile(env);
  const tasksFile = resolveTasksFile(env);
  const before = {
    attunement: await snapshot(attunementFile),
    tasks: await snapshot(tasksFile)
  };
  const report = await attunement.buildContinuityInteractionReport(
    await attunement.readAttunementState(attunementFile),
    attunement.createLocalContinuityTaskInteractionSourceResolver(tasksFile)
  );
  const after = {
    attunement: await snapshot(attunementFile),
    tasks: await snapshot(tasksFile)
  };
  const sourceInvariant = (name) => ({
    existsAfter: after[name].exists,
    existsBefore: before[name].exists,
    sha256Unchanged: before[name].sha256 === after[name].sha256
  });
  return validateLocalInteractionAuditArtifact({
    audit: report.audit,
    classification: "actual-local-read-only",
    digest: report.digest,
    files: {
      attunement: sourceInvariant("attunement"),
      tasks: sourceInvariant("tasks")
    },
    naturalLongitudinalEvidence: false,
    permissionExpansion: false,
    schema: "muse.continuity-interaction-audit-local/v1",
    syntheticDataUsed: false
  });
}

if (process.argv.includes("--audit-run")) {
  try {
    process.stdout.write(`${JSON.stringify(await runLocalInteractionAudit(), null, 2)}\n`);
  } catch (cause) {
    process.stderr.write(`dogfood:continuity-interaction-audit:local FAIL — ${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
