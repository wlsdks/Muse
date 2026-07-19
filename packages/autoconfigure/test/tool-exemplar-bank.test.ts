import { describe, expect, it } from "vitest";
import { DEFAULT_TOOL_EXEMPLAR_BANK } from "@muse/agent-core";

import { buildToolExemplarBank } from "../src/context-engineering-builders.js";
import type { MuseEnvironment } from "../src/index.js";

function envWith(overrides: Record<string, string>): MuseEnvironment {
  return overrides as unknown as MuseEnvironment;
}

describe("buildToolExemplarBank — shared few-shot bank wired into the production runtime", () => {
  it("returns the shared production bank by default, teaching orchestration and adjacent tool restraint", () => {
    const bank = buildToolExemplarBank(envWith({}));
    expect(bank).toBe(DEFAULT_TOOL_EXEMPLAR_BANK);
    expect(bank!.some((exemplar) => exemplar.tool === "run_tool_plan")).toBe(true);
    expect(bank!.some((exemplar) => exemplar.tool === "browser_look")).toBe(true);
    expect(bank!.some((exemplar) => exemplar.tool === "browser_read")).toBe(true);
    expect(bank!.some((exemplar) => exemplar.tool === "mac_app_read")).toBe(true);
    // Restraint cases remain so the bank doesn't bias toward eager invocation.
    expect(bank!.some((exemplar) => exemplar.tool === null)).toBe(true);
    expect(bank!.some((exemplar) => exemplar.tool !== null && exemplar.tool !== "run_tool_plan")).toBe(true);
  });

  it("withholds the bank when MUSE_TOOL_EXEMPLARS=false (clean opt-out)", () => {
    expect(buildToolExemplarBank(envWith({ MUSE_TOOL_EXEMPLARS: "false" }))).toBeUndefined();
  });

  it("stays on for any non-false value", () => {
    expect(buildToolExemplarBank(envWith({ MUSE_TOOL_EXEMPLARS: "true" }))).toBeDefined();
  });
});
