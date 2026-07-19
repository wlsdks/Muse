import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseAggregate, type ScaleAggregate } from "./scale.js";

async function canonicalFixture(): Promise<ScaleAggregate> {
  const raw = await readFile(new URL("../../../docs/benchmarks/eval-datasets-scale-v1.json", import.meta.url), "utf8");
  return JSON.parse(raw) as ScaleAggregate;
}

describe("closed canonical aggregate and replay result parsers", () => {
  it("accepts the tracked canonical result and keeps replay outside main totals", async () => {
    const valid = await canonicalFixture();
    expect(() => parseAggregate(valid)).not.toThrow();
    expect(valid.totals.generated).toBe(1_111_000);
    expect(valid.robustnessReplayResult.generated).toBe(1_000);
    expect(valid.robustnessReplayResult.robustnessReplay).toBe(true);
    expect(valid.robustnessReplayResult.heldOut).toBe(false);
  });

  it("rejects aggregate unknown, missing, and opposite fields", async () => {
    const valid = await canonicalFixture();
    expect(() => parseAggregate({ ...valid, unknown: true })).toThrow(/keys are not exact/);
    const missing = structuredClone(valid) as Partial<ScaleAggregate>;
    delete missing.capabilityClaim;
    expect(() => parseAggregate(missing)).toThrow(/keys are not exact/);
    expect(() => parseAggregate({ ...valid, organicEvidence: true })).toThrow(/provenance/);
  });

  it("rejects replay-result unknown, missing, and opposite fields", async () => {
    const valid = await canonicalFixture();
    expect(() => parseAggregate({ ...valid, robustnessReplayResult: { ...valid.robustnessReplayResult, unknown: true } })).toThrow(/keys are not exact/);
    const missingReplay = structuredClone(valid);
    const replay = missingReplay.robustnessReplayResult as Partial<ScaleAggregate["robustnessReplayResult"]>;
    delete replay.bulkCleanupVerified;
    expect(() => parseAggregate(missingReplay)).toThrow(/keys are not exact/);
    expect(() => parseAggregate({ ...valid, robustnessReplayResult: { ...valid.robustnessReplayResult, heldOut: true } })).toThrow(/failed closed/);
  });
});
