import { describe, expect, it } from "vitest";

import type { MuseEnvironment } from "../src/index.js";
import {
  buildContextWindowOptions,
  createDefaultRuntimeHooks,
  createInputGuards,
  createOutputGuards,
  createRunnerTools,
} from "../src/runtime-wiring.js";

const env = (overrides: Record<string, string> = {}): MuseEnvironment => overrides as MuseEnvironment;
const ids = (stages: readonly { readonly id: string }[]) => stages.map((s) => s.id);

describe("createDefaultRuntimeHooks", () => {
  it("ships no default hooks", () => {
    expect(createDefaultRuntimeHooks(env())).toEqual([]);
  });
});

describe("createInputGuards", () => {
  it("enables the injection + PII guards by default", () => {
    expect(ids(createInputGuards(env()))).toEqual(["injection-input-guard", "pii-input-guard"]);
  });

  it("returns nothing when the master flag is off", () => {
    expect(createInputGuards(env({ MUSE_INPUT_GUARDS_ENABLED: "false" }))).toEqual([]);
  });

  it("drops each guard independently when its flag is off", () => {
    expect(ids(createInputGuards(env({ MUSE_INPUT_GUARD_INJECTION_ENABLED: "false" })))).toEqual(["pii-input-guard"]);
    expect(ids(createInputGuards(env({ MUSE_INPUT_GUARD_PII_ENABLED: "false" })))).toEqual(["injection-input-guard"]);
  });
});

describe("createOutputGuards", () => {
  it("enables PII masking by default; the leak guard stays off until armed", () => {
    expect(ids(createOutputGuards(env()))).toEqual(["pii-output-mask"]);
  });

  it("returns nothing when the master flag is off", () => {
    expect(createOutputGuards(env({ MUSE_OUTPUT_GUARDS_ENABLED: "false" }))).toEqual([]);
  });

  it("adds the system-prompt-leak guard only when enabled AND canary tokens are supplied", () => {
    expect(ids(createOutputGuards(env({ MUSE_OUTPUT_GUARD_SYSTEM_PROMPT_LEAK_ENABLED: "true" })))).toEqual([
      "pii-output-mask",
    ]); // enabled but no canary → not added
    expect(
      ids(
        createOutputGuards(
          env({ MUSE_OUTPUT_GUARD_SYSTEM_PROMPT_LEAK_ENABLED: "true", MUSE_OUTPUT_GUARD_SYSTEM_PROMPT_CANARY_TOKENS: "SECRET1,SECRET2" }),
        ),
      ),
    ).toEqual(["pii-output-mask", "system-prompt-leakage-output-guard"]);
  });
});

describe("createRunnerTools", () => {
  it("is empty unless the runner is explicitly enabled (default off)", () => {
    expect(createRunnerTools(env())).toEqual([]);
  });

  it("exposes the run_command tool when enabled", () => {
    const tools = createRunnerTools(env({ MUSE_RUNNER_ENABLED: "true" }));
    expect(tools.map((t) => t.definition.name)).toEqual(["run_command"]);
  });
});

describe("buildContextWindowOptions", () => {
  it("derives the working budget as a ratio of the context window by default", () => {
    expect(buildContextWindowOptions(env())).toEqual({
      maxContextWindowTokens: 128_000,
      outputReserveTokens: 4_096,
      workingBudgetTokens: 51_200, // floor(128000 * 0.4)
      compactionStrategy: "temporal",
    });
  });

  it("omits workingBudgetTokens when explicitly set to 0 (proactive compaction off)", () => {
    const options = buildContextWindowOptions(env({ MUSE_LLM_WORKING_BUDGET_TOKENS: "0" }));
    expect(options).not.toHaveProperty("workingBudgetTokens");
    expect(options.compactionStrategy).toBe("temporal");
  });

  it("switches to importance strategy and carries a finite threshold when configured", () => {
    expect(buildContextWindowOptions(env({ MUSE_COMPACTION_STRATEGY: "importance", MUSE_COMPACTION_IMPORTANCE_THRESHOLD: "0.4" }))).toMatchObject({
      compactionStrategy: "importance",
      importanceThreshold: 0.4,
    });
  });

  it("ignores a non-finite importance threshold", () => {
    expect(buildContextWindowOptions(env({ MUSE_COMPACTION_IMPORTANCE_THRESHOLD: "abc" }))).not.toHaveProperty(
      "importanceThreshold",
    );
  });
});
