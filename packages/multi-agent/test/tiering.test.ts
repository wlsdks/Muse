import { describe, expect, it } from "vitest";
import { classifyTier, planTieredRun } from "../src/index.js";

const MODELS = { fast: "ollama/qwen3:1.7b", heavy: "ollama/qwen3:8b" } as const;

describe("classifyTier", () => {
  it("routes simple lookups to the fast tier", () => {
    expect(classifyTier("what is the capital of France")).toBe("fast");
    expect(classifyTier("what time is it in Tokyo")).toBe("fast");
    expect(classifyTier("convert 5 km to miles")).toBe("fast");
    expect(classifyTier("define entropy")).toBe("fast");
    expect(classifyTier("몇 시야 지금")).toBe("fast");
  });

  it("routes reasoning to the heavy tier", () => {
    expect(classifyTier("analyze the trade-offs between REST and gRPC")).toBe("heavy");
    expect(classifyTier("why does my code segfault")).toBe("heavy");
    expect(classifyTier("design a caching strategy")).toBe("heavy");
    expect(classifyTier("explain step by step how TLS works")).toBe("heavy");
    expect(classifyTier("두 방법을 비교해줘")).toBe("heavy");
  });

  it("defaults to heavy when unsure — never silently downgrades reasoning", () => {
    expect(classifyTier("the quarterly numbers and what they imply for us")).toBe("heavy");
    expect(classifyTier("")).toBe("heavy");
  });

  it("keeps a task with BOTH signals on heavy (reasoning wins)", () => {
    // "define" is a lookup signal but "strategy" is a reasoning signal —
    // the reasoning-first ordering must keep this heavy.
    expect(classifyTier("define a strategy to cut latency")).toBe("heavy");
  });
});

describe("planTieredRun", () => {
  const tasks = [
    { id: "a", text: "what is the capital of France" },
    { id: "b", text: "analyze the trade-offs between REST and gRPC" }
  ];

  it("assigns each task to its tier's model and runs parallel when the host holds both tiers", async () => {
    const plan = await planTieredRun({ canHoldBothTiers: () => true, models: MODELS, tasks });
    expect(plan.collapsedToHeavy).toBe(false);
    expect(plan.mode).toBe("parallel");
    expect(plan.assignments).toEqual([
      { id: "a", model: "ollama/qwen3:1.7b", tier: "fast" },
      { id: "b", model: "ollama/qwen3:8b", tier: "heavy" }
    ]);
  });

  it("collapses to the single heavy model sequentially when the host cannot hold both", async () => {
    const plan = await planTieredRun({ canHoldBothTiers: () => false, models: MODELS, tasks });
    expect(plan.collapsedToHeavy).toBe(true);
    expect(plan.mode).toBe("sequential");
    expect(plan.assignments.every((a) => a.model === "ollama/qwen3:8b" && a.tier === "heavy")).toBe(true);
    expect(new Set(plan.assignments.map((a) => a.model)).size).toBe(1);
  });

  it("fails open to single-heavy when the capacity probe throws (never downgrades to fast on probe error)", async () => {
    const plan = await planTieredRun({
      canHoldBothTiers: () => { throw new Error("probe unavailable"); },
      models: MODELS,
      tasks
    });
    expect(plan.collapsedToHeavy).toBe(true);
    expect(plan.mode).toBe("sequential");
    expect(plan.assignments.every((a) => a.model === "ollama/qwen3:8b")).toBe(true);
  });
});
