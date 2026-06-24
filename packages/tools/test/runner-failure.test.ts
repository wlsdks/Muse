import { describe, expect, it } from "vitest";

import { classifyRunnerFailure, createRustRunnerTool, type RunnerCommandResponse } from "../src/index.js";

const ok = { status: 0, stderr: "", error: null, timedOut: false };

describe("classifyRunnerFailure (TX-11)", () => {
  it("returns undefined for a successful result (no noise on the happy path)", () => {
    expect(classifyRunnerFailure(ok)).toBeUndefined();
    expect(classifyRunnerFailure({ status: 0, stderr: "warning: deprecated", error: null })).toBeUndefined();
  });

  it("classifies common failure kinds from stderr", () => {
    expect(classifyRunnerFailure({ status: 1, stderr: "bash: permission denied" })).toBe("permission");
    expect(classifyRunnerFailure({ status: 127, stderr: "foo: command not found" })).toBe("not_found");
    expect(classifyRunnerFailure({ status: 1, stderr: "curl: (6) Could not resolve host" })).toBe("network");
    expect(classifyRunnerFailure({ status: 137, stderr: "process killed: out of memory" })).toBe("out_of_memory");
  });

  it("classifies a timeout from the flag even with empty stderr", () => {
    expect(classifyRunnerFailure({ status: null, stderr: "", timedOut: true })).toBe("timeout");
  });

  it("falls back to generic for an unclassified non-zero exit", () => {
    expect(classifyRunnerFailure({ status: 2, stderr: "some opaque failure" })).toBe("generic");
  });
});

function fakeRunner(response: RunnerCommandResponse) {
  return createRustRunnerTool({ invokeRunner: async () => response });
}

describe("run_command surfaces failureKind to the model", () => {
  it("includes failureKind on a failed result", async () => {
    const tool = fakeRunner({ ok: false, status: 13, stdout: "", stderr: "permission denied", timedOut: false, truncated: false, error: null });
    const out = await tool.execute({ command: "cat /root/secret" }, {} as never) as RunnerCommandResponse;
    expect(out.failureKind).toBe("permission");
  });

  it("omits failureKind on a successful result", async () => {
    const tool = fakeRunner({ ok: true, status: 0, stdout: "done", stderr: "", timedOut: false, truncated: false, error: null });
    const out = await tool.execute({ command: "echo done" }, {} as never) as RunnerCommandResponse;
    expect(out.failureKind).toBeUndefined();
  });
});
