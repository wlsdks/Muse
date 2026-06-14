import type { AgentRunRecord, ToolCallRecord } from "@muse/runtime-state";
import { describe, expect, it } from "vitest";

import {
  aggregateFailurePatterns,
  dailyUsage,
  latencyDistribution,
  toolCallRanking,
  toolOutcomeStats
} from "./compat-run-aggregations.js";

// Direct coverage for the pure run-aggregation helpers (untested module) — the
// tool-usage / failure / latency analytics behind the admin observability
// routes. These are the ToolCorrectness + StepEfficiency observability surface:
// the outcome classification and failure bucketing decide what the dashboard
// reports about how the agent is actually behaving. All deterministic.

const call = (name: string, status: string, error?: string): ToolCallRecord =>
  ({ error, name, status }) as unknown as ToolCallRecord;
// `over` is a loose bag (cast to AgentRunRecord below) so a test can pass the
// runtime-real `error: null` that the DB row carries — AgentRunRecord types
// error as string|undefined, but classifyRunError handles null at runtime.
const run = (over: Record<string, unknown> & { id: string; createdAt: Date }): AgentRunRecord =>
  ({ completedAt: null, costUsd: "0", error: null, startedAt: null, ...over }) as unknown as AgentRunRecord;

describe("toolCallRanking", () => {
  it("counts total + failures per tool and ranks by total desc", () => {
    const calls = [call("notes:search", "completed"), call("notes:search", "failed", "timeout"), call("home_action", "blocked"), call("notes:search", "completed")];
    expect(toolCallRanking(calls)).toEqual([
      { failures: 1, name: "notes:search", total: 3 },
      { failures: 0, name: "home_action", total: 1 }
    ]);
  });
});

describe("toolOutcomeStats", () => {
  const calls = [
    call("notes:search", "completed"),
    call("notes:search", "failed", "timeout while reading"),
    call("home_action", "blocked"),
    call("web:fetch", "failed", "404 not found"),
    call("notes:search", "completed")
  ];

  it("classifies outcomes, derives the server prefix, and computes accuracy = ok/total", () => {
    const stats = toolOutcomeStats(calls);
    expect(stats.total).toBe(5);
    expect(stats.accuracy).toBe(0.4); // 2 ok / 5
    expect(stats.byOutcome).toEqual({ invalid_arg: 1, not_found: 1, ok: 2, timeout: 1 }); // completed→ok, blocked→invalid_arg
    expect(stats.byServer).toEqual({ local: 1, notes: 3, web: 1 }); // no-colon name → "local"
  });

  it("filters to a single server when given", () => {
    expect((toolOutcomeStats(calls, "notes") as { byServer: Record<string, number> }).byServer).toEqual({ notes: 3 });
  });

  it("returns accuracy 0 for no tool calls (no divide-by-zero)", () => {
    expect(toolOutcomeStats([]).accuracy).toBe(0);
  });
});

describe("aggregateFailurePatterns", () => {
  it("classifies run errors into buckets, caps sampleRunIds at 5, and ranks by count desc", () => {
    const runs = [
      run({ createdAt: new Date("2026-05-30T00:00:00Z"), error: "Timeout after 30s", id: "r1" }),
      run({ createdAt: new Date("2026-05-30T00:00:00Z"), error: "guard rejected the tool", id: "r2" }),
      run({ createdAt: new Date("2026-05-29T00:00:00Z"), error: null, id: "r3" }), // null → "unknown"
      run({ createdAt: new Date("2026-05-30T00:00:00Z"), error: "PLAN_VALIDATION_FAILED", id: "r4" }),
      run({ createdAt: new Date("2026-05-30T00:00:00Z"), error: "weird boom", id: "r5" }) // → "other"
    ];
    const result = aggregateFailurePatterns(runs) as { byClass: { errorClass: string; count: number; sampleRunIds: string[] }[]; totalFailures: number };
    expect(result.totalFailures).toBe(5);
    const classes = result.byClass.map((b) => b.errorClass).sort();
    expect(classes).toEqual(["guard_rejection", "other", "plan_validation_failed", "timeout", "unknown"]);
  });

  it("caps the sample run ids at 5 for a single dominant class", () => {
    const runs = Array.from({ length: 8 }, (_unused, i) => run({ createdAt: new Date("2026-05-30T00:00:00Z"), error: "timeout", id: `r${i.toString()}` }));
    const result = aggregateFailurePatterns(runs) as { byClass: { sampleRunIds: string[]; count: number }[] };
    expect(result.byClass[0]?.count).toBe(8);
    expect(result.byClass[0]?.sampleRunIds).toHaveLength(5); // capped
  });
});

describe("dailyUsage", () => {
  it("sums runs + cost per UTC day, sorted by date ascending", () => {
    const runs = [
      run({ costUsd: "0.5", createdAt: new Date("2026-05-30T01:00:00Z"), id: "a" }),
      run({ costUsd: "0.3", createdAt: new Date("2026-05-30T02:00:00Z"), id: "b" }),
      run({ costUsd: "0.1", createdAt: new Date("2026-05-29T00:00:00Z"), id: "c" })
    ];
    expect(dailyUsage(runs)).toEqual([
      { costUsd: 0.1, date: "2026-05-29", runs: 1 },
      { costUsd: 0.8, date: "2026-05-30", runs: 2 }
    ]);
  });
});

describe("latencyDistribution", () => {
  const start = new Date("2026-05-20T00:00:00.000Z");

  it("buckets a clean spread of finite latencies across ALL FOUR ranges", () => {
    expect(latencyDistribution([
      run({ id: "fast", createdAt: start, startedAt: start, completedAt: new Date(start.getTime() + 500) }),    // 0.5s
      run({ id: "med1", createdAt: start, startedAt: start, completedAt: new Date(start.getTime() + 2_000) }),  // 2s   → 1-5s
      run({ id: "med2", createdAt: start, startedAt: start, completedAt: new Date(start.getTime() + 10_000) }), // 10s  → 5-30s
      run({ id: "slow", createdAt: start, startedAt: start, completedAt: new Date(start.getTime() + 60_000) })  // 60s  → 30s+
    ])).toEqual({ "0-1s": 1, "1-5s": 1, "5-30s": 1, "30s+": 1, unknown: 0 });
  });

  it("counts a run missing startedAt or completedAt as unknown (existing contract)", () => {
    expect(latencyDistribution([
      run({ id: "no-end", createdAt: start, startedAt: start }),       // completedAt defaults null
      run({ id: "no-start", createdAt: start, completedAt: start })    // startedAt defaults null
    ])).toEqual({ "0-1s": 0, "1-5s": 0, "5-30s": 0, "30s+": 0, unknown: 2 });
  });

  it("routes an Invalid-Date startedAt/completedAt subtraction (NaN) to unknown — NOT silently the 30s+ bucket", () => {
    const invalid = new Date(Number.NaN);
    const buckets = latencyDistribution([
      run({ id: "bad-end", createdAt: start, startedAt: start, completedAt: invalid }),
      run({ id: "bad-start", createdAt: start, startedAt: invalid, completedAt: start }),
      run({ id: "both-bad", createdAt: start, startedAt: invalid, completedAt: invalid })
    ]);
    expect(buckets.unknown, "NaN latency must NOT inflate 30s+; it belongs in unknown").toBe(3);
    expect(buckets["30s+"]).toBe(0);
  });
});
