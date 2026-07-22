import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { workloadDecisionReceipt, withWorkloadBoundary } from "./daemon-resource-receipt.js";
import { describeDaemonWorkloadProfile, emptyDaemonWorkloadProfile, readDaemonWorkloadProfile, recordDaemonWorkloadReceipt, writeDaemonWorkloadProfile } from "./daemon-workload-profile.js";

const snapshot = { cpuCount: 8, freeMemoryBytes: 4_000_000_000, load1: 1, processCpuSystemMicros: 1, processCpuUserMicros: 2, residentMemoryBytes: 100, platform: "darwin" as const };

describe("daemon workload profile", () => {
  it("aggregates bounded decision and unit evidence without retaining raw events", () => {
    const decision = workloadDecisionReceipt({ status: "admit" }, snapshot, 9, "2026-07-22T00:00:00.000Z");
    const receipt = withWorkloadBoundary(decision, {
      at: "2026-07-22T00:00:01.000Z", cpuDeltaMicros: 500, durationMs: 40, queueDepth: 8,
      rssAfterBytes: 180, rssBeforeBytes: 100, status: "completed", stopRequestedDuring: false, unit: "reflection"
    });
    const profile = recordDaemonWorkloadReceipt(emptyDaemonWorkloadProfile("2026-07-22T00:00:00.000Z"), receipt);
    expect(profile).toMatchObject({ admitted: 1, boundaries: 1, units: { reflection: { completed: 1, maxDurationMs: 40, maxRssGrowthBytes: 80, totalCpuMicros: 500 } } });
    expect(describeDaemonWorkloadProfile(profile)).toContain("slowest-total reflection avg 40 ms max 40 ms");
  });

  it("round-trips atomically and rejects malformed evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-workload-profile-"));
    const file = join(dir, "profile.json");
    try {
      const profile = emptyDaemonWorkloadProfile("2026-07-22T00:00:00.000Z");
      await writeDaemonWorkloadProfile(file, profile);
      expect(await readDaemonWorkloadProfile(file)).toEqual(profile);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(await readDaemonWorkloadProfile(join(dir, "missing.json"))).toBeUndefined();
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("stays constant-size across a long-running resident history", () => {
    const decision = workloadDecisionReceipt({ status: "admit" }, snapshot, 9, "2026-07-22T00:00:00.000Z");
    const receipt = withWorkloadBoundary(decision, {
      at: "2026-07-22T00:00:01.000Z", cpuDeltaMicros: 5, durationMs: 2, queueDepth: 8,
      rssAfterBytes: 105, rssBeforeBytes: 100, status: "completed", stopRequestedDuring: false, unit: "reflection"
    });
    let profile = emptyDaemonWorkloadProfile("2026-07-22T00:00:00.000Z");
    for (let index = 0; index < 100_000; index += 1) profile = recordDaemonWorkloadReceipt(profile, receipt);

    expect(profile.boundaries).toBe(100_000);
    expect(profile.units.reflection?.totalDurationMs).toBe(200_000);
    expect(Buffer.byteLength(JSON.stringify(profile), "utf8")).toBeLessThan(2_000);
  });

  it("rotates the aggregate window after seven days so old totals cannot dominate forever", () => {
    const old = { ...emptyDaemonWorkloadProfile("2026-07-01T00:00:00.000Z"), admitted: 9, boundaries: 9 };
    const decision = workloadDecisionReceipt({ status: "admit" }, snapshot, 9, "2026-07-08T00:00:00.000Z");
    const receipt = withWorkloadBoundary(decision, {
      at: "2026-07-08T00:00:00.000Z", cpuDeltaMicros: 1, durationMs: 1, queueDepth: 8,
      rssAfterBytes: 100, rssBeforeBytes: 100, status: "completed", stopRequestedDuring: false, unit: "recap"
    });
    const rotated = recordDaemonWorkloadReceipt(old, receipt);
    expect(rotated).toMatchObject({ admitted: 1, boundaries: 1, since: "2026-07-08T00:00:00.000Z", units: { recap: { completed: 1 } } });
  });

  it("rejects schema-shaped profiles whose boundary totals have no unit evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-workload-profile-corrupt-"));
    const file = join(dir, "profile.json");
    try {
      await writeFile(file, JSON.stringify({
        admitted: 1, boundaries: 1, cancelled: 0, deferred: 0, schema: "muse.daemon-workload-profile/v1",
        since: "2026-07-22T00:00:00.000Z", units: {}, updatedAt: "2026-07-22T00:00:01.000Z"
      }), "utf8");
      expect(await readDaemonWorkloadProfile(file)).toBeUndefined();
      expect(describeDaemonWorkloadProfile(undefined)).toBe("no cumulative workload profile");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
