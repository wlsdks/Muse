import { describe, expect, it } from "vitest";

import { InMemoryInjectionDetectionCounter } from "../src/injection-detection-counter.js";

describe("InMemoryInjectionDetectionCounter", () => {
  it("bumps per-family counts and rolls up totals", () => {
    let now = new Date("2026-05-14T12:00:00Z");
    const counter = new InMemoryInjectionDetectionCounter({ now: () => now });
    counter.bumpFrom([
      { name: "history_poisoning", count: 2 },
      { name: "tool_spoofing", count: 1 }
    ]);
    const after = counter.bumpFrom([{ name: "history_poisoning", count: 3 }]);
    expect(after.total).toBe(6);
    expect(after.counts).toEqual({ history_poisoning: 5, tool_spoofing: 1 });
    expect(after.lastFiredAt).toBe("2026-05-14T12:00:00.000Z");

    // Empty findings array doesn't move the clock or bump anything.
    now = new Date("2026-05-15T12:00:00Z");
    const noopSnap = counter.bumpFrom([]);
    expect(noopSnap.total).toBe(6);
    expect(noopSnap.lastFiredAt).toBe("2026-05-14T12:00:00.000Z");

    // Reset clears counters + lastFiredAt.
    counter.reset();
    const empty = counter.snapshot();
    expect(empty.total).toBe(0);
    expect(empty.counts).toEqual({});
    expect(empty.lastFiredAt).toBeUndefined();
  });

  it("ignores zero/negative counts and empty names", () => {
    const counter = new InMemoryInjectionDetectionCounter();
    counter.bumpFrom([
      { name: "", count: 5 },
      { name: "ok", count: 0 },
      { name: "ok", count: -3 },
      { name: "real_family", count: 2 }
    ]);
    const snap = counter.snapshot();
    expect(snap.counts).toEqual({ real_family: 2 });
    expect(snap.total).toBe(2);
  });

  it("rejects non-finite (NaN / Infinity) counts so a buggy detector cannot poison the family bucket OR the rollup total", () => {
    // `count <= 0` returns false for NaN / Infinity (any comparison
    // with NaN is false), so without the finite guard a single bad
    // finding would set the bucket to NaN, and EVERY subsequent
    // snapshot would show `total: NaN` — a permanent dashboard
    // outage from one bad detector emission.
    const counter = new InMemoryInjectionDetectionCounter();
    counter.bumpFrom([
      { name: "history_poisoning", count: Number.NaN },
      { name: "tool_spoofing", count: Number.POSITIVE_INFINITY },
      { name: "data_exfiltration", count: Number.NEGATIVE_INFINITY },
      { name: "real_family", count: 4 }
    ]);
    const snap = counter.snapshot();
    expect(snap.counts).toEqual({ real_family: 4 });
    expect(snap.total).toBe(4);
    // Critically: total stays a finite number, not NaN.
    expect(Number.isFinite(snap.total)).toBe(true);
  });

  it("does not advance lastFiredAt when every finding is skipped (the bucket genuinely did not move)", () => {
    let now = new Date("2026-05-21T08:00:00.000Z");
    const counter = new InMemoryInjectionDetectionCounter({ now: () => now });
    counter.bumpFrom([{ name: "history_poisoning", count: 1 }]);
    expect(counter.snapshot().lastFiredAt).toBe("2026-05-21T08:00:00.000Z");

    // Move the clock forward then call bumpFrom with only invalid
    // findings — lastFiredAt should NOT advance, because nothing
    // actually fired.
    now = new Date("2026-05-22T10:00:00.000Z");
    counter.bumpFrom([
      { name: "", count: 5 },
      { name: "ok", count: 0 },
      { name: "ok", count: Number.NaN }
    ]);
    expect(counter.snapshot().lastFiredAt).toBe("2026-05-21T08:00:00.000Z");

    // A real bump after the all-skipped batch advances the clock as expected.
    counter.bumpFrom([{ name: "tool_spoofing", count: 2 }]);
    expect(counter.snapshot().lastFiredAt).toBe("2026-05-22T10:00:00.000Z");
  });
});
