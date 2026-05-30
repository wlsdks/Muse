import { describe, expect, it } from "vitest";

import { SloAlertEvaluator } from "../src/observability-detectors.js";

// Direct coverage for the SLO alert evaluator (untested module). It decides when
// to fire a latency / error-rate alert, so the minSamples gate, the strict
// threshold, the cooldown (no alert storm), and the rolling-window eviction are
// the load-bearing behaviors — pinned with an injected clock.

let clock = 1_000_000;
const now = () => clock;
const evaluator = () =>
  new SloAlertEvaluator({ cooldownSeconds: 30, errorRateThreshold: 0.2, latencyThresholdMs: 100, minSamples: 5, now, windowSeconds: 60 });

describe("SloAlertEvaluator", () => {
  it("does not alert below minSamples, then fires a latency violation once enough over-threshold samples arrive", () => {
    clock = 1_000_000;
    const e = evaluator();
    for (let i = 0; i < 4; i += 1) e.recordLatency(500);
    expect(e.evaluate()).toEqual([]); // 4 < minSamples 5
    e.recordLatency(500);
    expect(e.evaluate().map((v) => v.type)).toEqual(["latency"]);
  });

  it("respects the cooldown: a fresh evaluate right after an alert is suppressed, and fires again after the cooldown elapses", () => {
    clock = 1_000_000;
    const e = evaluator();
    for (let i = 0; i < 5; i += 1) e.recordLatency(500);
    expect(e.evaluate().map((v) => v.type)).toEqual(["latency"]);
    expect(e.evaluate()).toEqual([]); // within cooldown
    clock += 31_000;
    e.recordLatency(500);
    expect(e.evaluate().map((v) => v.type)).toEqual(["latency"]); // cooldown elapsed
  });

  it("fires an error-rate violation when the failure ratio exceeds the threshold", () => {
    clock = 1_000_000;
    const e = evaluator();
    for (let i = 0; i < 5; i += 1) e.recordResult(i < 2); // 3 failures / 5 = 0.6 > 0.2
    const v = e.evaluate();
    expect(v.map((x) => x.type)).toEqual(["error_rate"]);
    expect(v[0]!.currentValue).toBeCloseTo(0.6, 5);
  });

  it("uses a STRICT threshold: a p95 exactly AT the threshold does not alert", () => {
    clock = 1_000_000;
    const e = evaluator();
    for (let i = 0; i < 5; i += 1) e.recordLatency(100); // p95 == 100 == threshold
    expect(e.evaluate()).toEqual([]);
  });

  it("evicts samples older than the rolling window (a stale spike stops alerting)", () => {
    clock = 1_000_000;
    const e = evaluator();
    for (let i = 0; i < 5; i += 1) e.recordLatency(500);
    clock += 61_000; // all five fall outside the 60s window
    expect(e.evaluate()).toEqual([]);
    expect(e.snapshot().latencySamples).toBe(0);
  });

  it("ignores a non-finite latency sample and clamps a negative one (snapshot reflects only valid samples)", () => {
    clock = 1_000_000;
    const e = evaluator();
    e.recordLatency(Number.NaN);
    e.recordLatency(Number.POSITIVE_INFINITY);
    expect(e.snapshot().latencySamples).toBe(0);
    e.recordLatency(-50); // clamped to 0, still recorded
    expect(e.snapshot().latencySamples).toBe(1);
    expect(e.snapshot().latencyP95Ms).toBe(0);
  });

  it("rejects invalid threshold / window / cooldown / minSamples at construction", () => {
    expect(() => new SloAlertEvaluator({ cooldownSeconds: 1, errorRateThreshold: 0.1, latencyThresholdMs: -1, windowSeconds: 1 })).toThrow();
    expect(() => new SloAlertEvaluator({ cooldownSeconds: 1, errorRateThreshold: 1.5, latencyThresholdMs: 1, windowSeconds: 1 })).toThrow();
    expect(() => new SloAlertEvaluator({ cooldownSeconds: 1, errorRateThreshold: 0.1, latencyThresholdMs: 1, windowSeconds: 0 })).toThrow();
    expect(() => new SloAlertEvaluator({ cooldownSeconds: -1, errorRateThreshold: 0.1, latencyThresholdMs: 1, windowSeconds: 1 })).toThrow();
    expect(() => new SloAlertEvaluator({ cooldownSeconds: 1, errorRateThreshold: 0.1, latencyThresholdMs: 1, minSamples: 0, windowSeconds: 1 })).toThrow();
  });
});
