import { describe, expect, it, vi } from "vitest";

import type { RecallHitLike } from "@muse/memory";

import { runMemoryConsolidationTick, type MemoryConsolidationTickDeps } from "./memory-consolidate-tick.js";

function makeHits(n: number, nowMs: number): readonly RecallHitLike[] {
  return Array.from({ length: n }, (_, i) => ({
    hits: 5,
    key: `mem-${i.toString()}`,
    lastHitMs: nowMs - i * 1000
  }));
}

describe("runMemoryConsolidationTick", () => {
  it("enabled + brake passes — logs promote/fade counts and returns nextState with lastRunMs=nowMs", async () => {
    const nowMs = Date.now();
    const logs: string[] = [];
    const readHits = vi.fn(async () => makeHits(5, nowMs));
    const deps: MemoryConsolidationTickDeps = {
      enabled: true,
      lastRunMs: undefined,
      log: (line) => logs.push(line),
      minIntervalMs: 1,
      minNewHits: 1,
      nowMs,
      readHits
    };
    const state = await runMemoryConsolidationTick(deps);
    expect(readHits).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/consolidate-memory:/);
    expect(logs[0]).toMatch(/promotable/);
    expect(logs[0]).toMatch(/fading/);
    expect(state.lastRunMs).toBe(nowMs);
  });

  it("disabled — readHits not called, log not called, state unchanged", async () => {
    const nowMs = Date.now();
    const logs: string[] = [];
    const readHits = vi.fn(async () => makeHits(5, nowMs));
    const prevLastRunMs = nowMs - 99_000;
    const deps: MemoryConsolidationTickDeps = {
      enabled: false,
      lastRunMs: prevLastRunMs,
      log: (line) => logs.push(line),
      nowMs,
      readHits
    };
    const state = await runMemoryConsolidationTick(deps);
    expect(readHits).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
    expect(state.lastRunMs).toBe(prevLastRunMs);
  });

  it("enabled but brake fails (ran too recently) — log not called, state unchanged", async () => {
    const nowMs = Date.now();
    const logs: string[] = [];
    const recentRunMs = nowMs - 60_000;
    const readHits = vi.fn(async () => makeHits(5, nowMs));
    const deps: MemoryConsolidationTickDeps = {
      enabled: true,
      lastRunMs: recentRunMs,
      log: (line) => logs.push(line),
      minIntervalMs: 6 * 60 * 60 * 1000,
      nowMs,
      readHits
    };
    const state = await runMemoryConsolidationTick(deps);
    expect(logs).toHaveLength(0);
    expect(state.lastRunMs).toBe(recentRunMs);
  });

  it("readHits throws — fail-soft: no log, state unchanged", async () => {
    const nowMs = Date.now();
    const logs: string[] = [];
    const prevLastRunMs = undefined;
    const readHits = vi.fn(async (): Promise<readonly RecallHitLike[]> => { throw new Error("disk error"); });
    const deps: MemoryConsolidationTickDeps = {
      enabled: true,
      lastRunMs: prevLastRunMs,
      log: (line) => logs.push(line),
      nowMs,
      readHits
    };
    const state = await runMemoryConsolidationTick(deps);
    expect(readHits).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(0);
    expect(state.lastRunMs).toBe(prevLastRunMs);
  });
});
