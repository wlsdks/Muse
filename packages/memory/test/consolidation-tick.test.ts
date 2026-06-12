import { describe, expect, it } from "vitest";

import {
  consolidationPlan,
  planMemoryConsolidationTick,
  type MemoryConsolidationTickState,
  type RecallHitLike
} from "../src/index.js";

const NOW = 10_000_000_000;
const hoursMs = (h: number): number => h * 60 * 60_000;

function rec(key: string, lastHitMs: number, hits = 5): RecallHitLike {
  return { key, hits, lastHitMs };
}

const DEFAULT_OPTS = {
  nowMs: NOW,
  minNewHits: 3,
  minIntervalMs: hoursMs(6)
} as const;

const NEVER_RUN: MemoryConsolidationTickState = { lastRunMs: undefined };

describe("planMemoryConsolidationTick", () => {
  it("never-run + enough fresh material → ran, plan defined, nextState advanced", () => {
    const records = [
      rec("a", NOW - hoursMs(1)),
      rec("b", NOW - hoursMs(2)),
      rec("c", NOW - hoursMs(3))
    ];
    const result = planMemoryConsolidationTick(records, NEVER_RUN, DEFAULT_OPTS);
    expect(result.ran).toBe(true);
    expect(result.plan).toBeDefined();
    expect(Array.isArray(result.plan!.promote)).toBe(true);
    expect(Array.isArray(result.plan!.fade)).toBe(true);
    expect(result.nextState.lastRunMs).toBe(NOW);
  });

  it("never-run + too little material → ran false, plan undefined, state unchanged", () => {
    const records = [rec("a", NOW - hoursMs(1))];
    const result = planMemoryConsolidationTick(records, NEVER_RUN, DEFAULT_OPTS);
    expect(result.ran).toBe(false);
    expect(result.plan).toBeUndefined();
    expect(result.nextState).toEqual(NEVER_RUN);
  });

  it("recently run (time brake) → ran false, state unchanged", () => {
    const lastRunMs = NOW - hoursMs(1);
    const state: MemoryConsolidationTickState = { lastRunMs };
    const records = [
      rec("a", NOW - hoursMs(0.5)),
      rec("b", NOW - hoursMs(0.6)),
      rec("c", NOW - hoursMs(0.7)),
      rec("d", NOW - hoursMs(0.8))
    ];
    const result = planMemoryConsolidationTick(records, state, DEFAULT_OPTS);
    expect(result.ran).toBe(false);
    expect(result.plan).toBeUndefined();
    expect(result.nextState).toEqual(state);
  });

  it("long-ago run + new material → ran true, nextState advanced to nowMs", () => {
    const lastRunMs = NOW - hoursMs(7);
    const state: MemoryConsolidationTickState = { lastRunMs };
    const records = [
      rec("a", lastRunMs + 1),
      rec("b", lastRunMs + 2),
      rec("c", lastRunMs + 3)
    ];
    const result = planMemoryConsolidationTick(records, state, DEFAULT_OPTS);
    expect(result.ran).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.nextState.lastRunMs).toBe(NOW);
  });

  it("long-ago run but all material predates last run → ran false (stale, newHits=0)", () => {
    const lastRunMs = NOW - hoursMs(7);
    const state: MemoryConsolidationTickState = { lastRunMs };
    const records = [
      rec("a", lastRunMs - hoursMs(1)),
      rec("b", lastRunMs - hoursMs(2)),
      rec("c", lastRunMs - hoursMs(3))
    ];
    const result = planMemoryConsolidationTick(records, state, DEFAULT_OPTS);
    expect(result.ran).toBe(false);
    expect(result.plan).toBeUndefined();
    expect(result.nextState).toEqual(state);
  });

  it("when ran, plan matches consolidationPlan output (same promoted keys)", () => {
    const records = [
      rec("alpha", NOW - hoursMs(1)),
      rec("beta", NOW - hoursMs(2)),
      rec("gamma", NOW - hoursMs(3))
    ];
    const result = planMemoryConsolidationTick(records, NEVER_RUN, DEFAULT_OPTS);
    const direct = consolidationPlan(records, DEFAULT_OPTS);
    expect(result.ran).toBe(true);
    const promotedKeys = result.plan!.promote.map((p) => p.key).sort();
    const directKeys = direct.promote.map((p) => p.key).sort();
    expect(promotedKeys).toEqual(directKeys);
    const fadedKeys = result.plan!.fade.map((f) => f.key).sort();
    const directFadeKeys = direct.fade.map((f) => f.key).sort();
    expect(fadedKeys).toEqual(directFadeKeys);
  });

  it("custom minNewHits and minIntervalMs honored — small values flip the result", () => {
    const lastRunMs = NOW - hoursMs(2);
    const state: MemoryConsolidationTickState = { lastRunMs };
    const records = [rec("x", lastRunMs + 1)];

    const withDefaults = planMemoryConsolidationTick(records, state, DEFAULT_OPTS);
    expect(withDefaults.ran).toBe(false);

    const withCustom = planMemoryConsolidationTick(records, state, {
      nowMs: NOW,
      minNewHits: 1,
      minIntervalMs: hoursMs(1)
    });
    expect(withCustom.ran).toBe(true);
    expect(withCustom.nextState.lastRunMs).toBe(NOW);
  });
});
