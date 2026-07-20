import assert from "node:assert/strict";
import test from "node:test";

import { main } from "./eval-agent-artifacts.mjs";

test("--json emits only the exact path-free runtime artifact digest contract", () => {
  let stdout = "";
  const exitCodes = [];
  const report = main(["--json"], {
    captureArtifacts: () => ({
      count: 41,
      digest: "a".repeat(64),
      privatePath: "/Users/private-owner/muse-runner",
      status: "ok",
    }),
    setExitCode: (value) => exitCodes.push(value),
    stdout: { write: (chunk) => { stdout += chunk; } },
  });

  assert.deepEqual(report, { status: "ok", digest: "a".repeat(64), count: 41 });
  assert.deepEqual(JSON.parse(stdout), report);
  assert.deepEqual(Object.keys(report), ["status", "digest", "count"]);
  assert.doesNotMatch(stdout, /Users|private-owner|muse-runner/u);
  assert.deepEqual(exitCodes, []);
});

test("artifact probe errors fail closed without exposing error or path text", () => {
  let stdout = "";
  const exitCodes = [];
  const report = main(["--json"], {
    captureArtifacts: () => {
      throw new Error("/Users/private-owner/secret-runner");
    },
    setExitCode: (value) => exitCodes.push(value),
    stdout: { write: (chunk) => { stdout += chunk; } },
  });

  assert.deepEqual(report, { status: "unknown", count: 0 });
  assert.deepEqual(JSON.parse(stdout), report);
  assert.doesNotMatch(stdout, /Users|private-owner|secret-runner/u);
  assert.deepEqual(exitCodes, [1]);
});
