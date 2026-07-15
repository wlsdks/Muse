// node --test coverage for tsconfig alignment guard helpers.
import assert from "node:assert/strict";
import test from "node:test";

import {
  collectConfigPaths,
  collectAllTsconfigProblems,
  collectTsconfigProblems,
  findBaseConflictKeys,
  findDisallowedCompilerOptions,
  findMissingBaseTypes,
  isBaseAligned
} from "./check-tsconfig-options.mjs";

test("detect whether tsconfig extends base", () => {
  assert.equal(isBaseAligned("../../tsconfig.base.json"), true);
  assert.equal(isBaseAligned("./tsconfig.base.json"), true);
  assert.equal(isBaseAligned("../base.json"), false);
});

test("detect disallowed compilerOptions keys", () => {
  const disallowed = findDisallowedCompilerOptions({ target: "ES2025", outDir: "dist", rootDir: "src", module: "NodeNext", types: ["node"] });
  assert.equal(disallowed.length, 0);

  const withUnexpected = findDisallowedCompilerOptions({ target: "ES2025", customOption: true, outDir: "dist" });
  assert.deepEqual(withUnexpected, ["customOption"]);
});

test("collectConfigPaths returns sorted list including monorepo tsconfigs", () => {
  const paths = collectConfigPaths();
  const sorted = [...paths].sort();
  assert.deepEqual(paths, sorted);
  assert.equal(paths.includes("tsconfig.json"), true);
  assert.equal(paths.some((path) => path.endsWith("apps/cli/tsconfig.json")), true);
  assert.equal(paths.some((path) => path.endsWith("packages/agent-core/tsconfig.json")), true);
});

test("findMissingBaseTypes detects dropped base compiler types", () => {
  assert.deepEqual(findMissingBaseTypes(["node", "dom"], ["node"]), ["dom"]);
  assert.deepEqual(findMissingBaseTypes(["node", "dom"], ["node", "dom"]), []);
  assert.deepEqual(findMissingBaseTypes(["node"], undefined), []);
});

test("collectTsconfigProblems emits focused issues for unsupported shapes", () => {
  const problemsWithUnexpected = collectTsconfigProblems(
    { extends: "./tsconfig.base.json" },
    { target: "ES2025", module: "NodeNext", customOption: "bad" }
  );
  assert.equal(problemsWithUnexpected.length, 1);
  assert.equal(problemsWithUnexpected[0].includes("unexpected compilerOptions overrides"), true);
});

test("collectTsconfigProblems emits layered checks for base conflict and type inheritance", () => {
  const problems = collectTsconfigProblems(
    { extends: "../../tsconfig.base.json" },
    { target: "ES2021", module: "NodeNext", strict: false, types: ["node"] }
  );
  assert.equal(problems.some((p) => p.includes("overrides conflict with base values")), true);
});

test("detect base option conflicts", () => {
  const base = { target: "ES2025", module: "NodeNext", strict: true };
  const override = { target: "ES2021", module: "NodeNext", strict: false, outDir: "dist" };
  const conflicts = findBaseConflictKeys(base, override);
  assert.deepEqual(conflicts, ["target", "strict"]);
});

test("collectAllTsconfigProblems currently has no active violations in this workspace", () => {
  const problems = collectAllTsconfigProblems();
  assert.equal(Object.keys(problems).length, 0);
});
