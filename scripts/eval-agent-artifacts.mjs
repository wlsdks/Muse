#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  captureRuntimeArtifacts,
  defaultEvalRunnerPath,
} from "./eval-agent-provenance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");

/** Recompute the current fixed runtime manifest without returning any paths. */
export function createArtifactDigestReport(dependencies = {}) {
  const repoRoot = dependencies.repoRoot ?? REPO_ROOT;
  const runnerPath = dependencies.runnerPath ?? defaultEvalRunnerPath(repoRoot);
  const captureArtifacts = dependencies.captureArtifacts ?? captureRuntimeArtifacts;
  try {
    const snapshot = captureArtifacts({ repoRoot, runnerPath });
    if (
      snapshot?.status === "ok"
      && typeof snapshot.digest === "string"
      && /^[a-f0-9]{64}$/u.test(snapshot.digest)
      && Number.isSafeInteger(snapshot.count)
      && snapshot.count > 0
    ) {
      return { status: "ok", digest: snapshot.digest, count: snapshot.count };
    }
  } catch {
    // Fail closed below without serializing exception text.
  }
  return { status: "unknown", count: 0 };
}

export function main(args = process.argv.slice(2), dependencies = {}) {
  const report = createArtifactDigestReport(dependencies);
  const stdout = dependencies.stdout ?? process.stdout;
  if (args.includes("--json")) {
    stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    const digest = report.status === "ok" ? ` ${report.digest} (${report.count.toString()} files)` : "";
    stdout.write(`runtime-artifacts ${report.status}${digest}\n`);
  }
  if (report.status !== "ok") {
    const setExitCode = dependencies.setExitCode ?? ((value) => { process.exitCode = value; });
    setExitCode(1);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
