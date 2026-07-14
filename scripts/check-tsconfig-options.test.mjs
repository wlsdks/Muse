// node --test coverage for tsconfig alignment guard helpers.
import assert from "node:assert/strict";
import test from "node:test";

import {
  findBaseConflictKeys,
  findDisallowedCompilerOptions,
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

test("detect base option conflicts", () => {
  const base = { target: "ES2025", module: "NodeNext", strict: true };
  const override = { target: "ES2021", module: "NodeNext", strict: false, outDir: "dist" };
  const conflicts = findBaseConflictKeys(base, override);
  assert.deepEqual(conflicts, ["target", "strict"]);
});
