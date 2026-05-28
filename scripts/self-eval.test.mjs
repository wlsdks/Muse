// Deterministic unit tests for the self-eval pure helpers.
// Run: node --test scripts/self-eval.test.mjs   (zero deps, no Ollama)

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countTestFileNames,
  countVerifiedCapabilityLines,
  detectRegressions,
  summarize
} from "./self-eval.mjs";

test("countTestFileNames counts distinct *.test.ts(x), ignoring non-tests", () => {
  assert.equal(countTestFileNames(["a.test.ts", "b.test.tsx", "a.test.ts", "c.ts", "d.md"]), 2);
  assert.equal(countTestFileNames([]), 0);
});

test("countVerifiedCapabilityLines counts only lines citing a test file or script", () => {
  const text = [
    "[Reach] foo — surface — a.test.ts — P1",
    "[Anticipation] bar — surface — scripts/smoke-broad-http.mjs — P2",
    "## a heading with no proof",
    "[Autonomy] baz — surface — (no citation yet)"
  ].join("\n");
  assert.equal(countVerifiedCapabilityLines(text), 2);
});

test("detectRegressions: pass→fail and numeric drops are regressions", () => {
  const prev = { gates: { lint: { status: "pass" }, testFiles: { status: "pass", value: 100 } } };
  const curr = { gates: { lint: { status: "fail" }, testFiles: { status: "pass", value: 97 } } };
  const r = detectRegressions(prev, curr);
  assert.ok(r.some((x) => x.startsWith("lint:")));
  assert.ok(r.some((x) => x.includes("100→97")));
  assert.equal(r.length, 2);
});

test("detectRegressions: improvements and first-run are NOT regressions", () => {
  const prev = { gates: { testFiles: { status: "pass", value: 100 }, lint: { status: "fail" } } };
  const curr = { gates: { testFiles: { status: "pass", value: 120 }, lint: { status: "pass" } } };
  assert.deepEqual(detectRegressions(prev, curr), []); // count up + fail→pass = no regression
  assert.deepEqual(detectRegressions(undefined, curr), []); // no baseline
});

test("detectRegressions ignores gates absent from the previous entry", () => {
  const prev = { gates: { lint: { status: "pass" } } };
  const curr = { gates: { lint: { status: "pass" }, tests: { status: "fail" } } };
  assert.deepEqual(detectRegressions(prev, curr), []); // `tests` is new, not a regression
});

test("summarize flags regressions and renders gate values", () => {
  const entry = { at: "now", gates: { lint: { status: "pass" }, testFiles: { status: "pass", value: 42 } } };
  assert.match(summarize(entry, []), /\[self-eval ok\].*lint:pass.*testFiles=42/u);
  assert.match(summarize(entry, ["lint: pass→fail"]), /REGRESSION \(1\).*lint: pass→fail/u);
});
