import type { AgentRunRecord } from "@muse/runtime-state";
import { describe, expect, it } from "vitest";

import { latencyDistribution } from "../src/compat-run-aggregations.js";

function run(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    costUsd: "0",
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    id: "r1",
    input: "x",
    mode: "agent",
    model: "qwen3:8b",
    provider: "ollama",
    status: "succeeded",
    tokenUsage: {},
    updatedAt: new Date("2026-05-20T00:00:00.000Z"),
    ...overrides
  };
}

describe("latencyDistribution (compat run aggregation finite-latency guard)", () => {
  it("buckets a clean spread of finite latencies", () => {
    const start = new Date("2026-05-20T00:00:00.000Z");
    const buckets = latencyDistribution([
      run({ id: "fast", startedAt: start, completedAt: new Date(start.getTime() + 500) }),
      run({ id: "med1", startedAt: start, completedAt: new Date(start.getTime() + 2_000) }),
      run({ id: "med2", startedAt: start, completedAt: new Date(start.getTime() + 10_000) }),
      run({ id: "slow", startedAt: start, completedAt: new Date(start.getTime() + 60_000) })
    ]);
    expect(buckets).toEqual({ "0-1s": 1, "1-5s": 1, "5-30s": 1, "30s+": 1, unknown: 0 });
  });

  it("buckets runs missing startedAt or completedAt as unknown (existing contract)", () => {
    const buckets = latencyDistribution([
      run({ id: "no-end", startedAt: new Date() }),
      run({ id: "no-start", completedAt: new Date() })
    ]);
    expect(buckets).toEqual({ "0-1s": 0, "1-5s": 0, "5-30s": 0, "30s+": 0, unknown: 2 });
  });

  it("routes an Invalid-Date startedAt / completedAt subtraction (NaN) to the unknown bucket — not silently classified as 30s+", () => {
    const start = new Date("2026-05-20T00:00:00.000Z");
    const invalid = new Date(Number.NaN);
    const buckets = latencyDistribution([
      run({ id: "bad-end", startedAt: start, completedAt: invalid }),
      run({ id: "bad-start", startedAt: invalid, completedAt: start }),
      run({ id: "both-bad", startedAt: invalid, completedAt: invalid })
    ]);
    expect(buckets.unknown, "NaN latency must NOT inflate the 30s+ bucket; it belongs in unknown").toBe(3);
    expect(buckets["30s+"]).toBe(0);
  });
});
