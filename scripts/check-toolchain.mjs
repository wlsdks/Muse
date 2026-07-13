#!/usr/bin/env node
// Toolchain guard: the repo builds with TypeScript 7 (the Go-native compiler)
// while every tool that imports the TypeScript MODULE keeps TypeScript 6.
//
// TS 7.0 ships no programmatic compiler API (it lands in 7.1), so
// typescript-eslint and knip — which import `typescript` directly — crash on it.
// The split is: `typescript` (the module) stays at 6, and `typescript7` is an
// npm alias whose `tsc` binary wins in node_modules/.bin. Measured on this repo:
// a clean full build goes 17.4s -> 3.2s, output is byte-complete (1622 .d.ts),
// tests pass against the TS7-emitted dist, and lint stays green.
//
// That split relies on pnpm's bin-linking order, which is deterministic but not
// contractual. If it ever flips, builds would silently fall back to the slow
// compiler — or, worse, lint would start resolving TS7 and crash. This gate makes
// either outcome a loud failure instead of a silent one.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function parseMajor(version) {
  const match = /(\d+)\./u.exec(version.trim());
  return match ? Number(match[1]) : Number.NaN;
}

export const EXPECTED_BUILD_MAJOR = 7;
export const EXPECTED_MODULE_MAJOR = 6;

function main() {
  const require = createRequire(import.meta.url);
  const moduleVersion = require("typescript").version;
  const binVersion = execFileSync("node_modules/.bin/tsc", ["--version"], { encoding: "utf8" })
    .replace(/^Version\s*/iu, "");

  const problems = [];
  if (parseMajor(binVersion) !== EXPECTED_BUILD_MAJOR) {
    problems.push(
      `the \`tsc\` binary is v${binVersion.trim()} — builds must run on the TypeScript ${EXPECTED_BUILD_MAJOR} native compiler (5x faster; the \`typescript7\` alias provides it)`
    );
  }
  if (parseMajor(moduleVersion) !== EXPECTED_MODULE_MAJOR) {
    problems.push(
      `the \`typescript\` MODULE is v${moduleVersion} — typescript-eslint and knip import it and crash on ${EXPECTED_BUILD_MAJOR}.0, which ships no compiler API (it lands in 7.1). Keep it at ${EXPECTED_MODULE_MAJOR}.`
    );
  }

  if (problems.length > 0) {
    console.error("✗ toolchain split broken:");
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }
  console.log(`✓ toolchain: build tsc v${binVersion.trim()} (native) · typescript module v${moduleVersion} (compiler API for eslint/knip)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
