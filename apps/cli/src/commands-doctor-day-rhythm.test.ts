import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dayRhythmDoctorCheck, readDayRhythmDoctorCheck } from "./commands-doctor-day-rhythm.js";

const now = new Date("2026-07-18T10:00:00Z");

describe("dayRhythmDoctorCheck — pure", () => {
  it("off (default) → ok, not a health problem", () => {
    const check = dayRhythmDoctorCheck({
      config: { enabled: false, eveningHour: 18, morningHour: 8 },
      lastBriefingDeliveredAtIso: undefined,
      pairedChannel: undefined
    }, now);
    expect(check).toMatchObject({ name: "day rhythm", status: "ok" });
    expect(check.detail).toMatch(/off/i);
  });

  it("on but no paired channel → warn (nothing can actually be delivered)", () => {
    const check = dayRhythmDoctorCheck({
      config: { enabled: true, eveningHour: 18, morningHour: 8 },
      lastBriefingDeliveredAtIso: undefined,
      pairedChannel: undefined
    }, now);
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/no channel paired/);
  });

  it("on + paired, never delivered yet → ok, names the channel and hours", () => {
    const check = dayRhythmDoctorCheck({
      config: { enabled: true, eveningHour: 19, morningHour: 7 },
      lastBriefingDeliveredAtIso: undefined,
      pairedChannel: { destination: "555", providerId: "telegram" }
    }, now);
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("morning ~7:00");
    expect(check.detail).toContain("evening ~19:00");
    expect(check.detail).toContain("telegram");
    expect(check.detail).toMatch(/no briefing delivered yet/);
  });

  it("on + paired + a real last-delivered timestamp → surfaces a relative time", () => {
    const check = dayRhythmDoctorCheck({
      config: { enabled: true, eveningHour: 18, morningHour: 8 },
      lastBriefingDeliveredAtIso: "2026-07-18T08:00:00Z",
      pairedChannel: { destination: "555", providerId: "telegram" }
    }, now);
    expect(check.detail).toMatch(/last briefing delivered/);
    expect(check.detail).not.toMatch(/no briefing delivered yet/);
  });
});

describe("readDayRhythmDoctorCheck — IO wrapper", () => {
  function tmpFiles() {
    const dir = mkdtempSync(join(tmpdir(), "muse-doctor-day-rhythm-"));
    return { briefingSidecarFile: join(dir, "briefing-fired.json"), channelOwnersFile: join(dir, "channel-owners.json"), configFile: join(dir, "config.json") };
  }

  it("absent config/owners/sidecar files → off, ok (never throws on a fresh install)", async () => {
    const { briefingSidecarFile, channelOwnersFile, configFile } = tmpFiles();
    const check = await readDayRhythmDoctorCheck(configFile, channelOwnersFile, briefingSidecarFile, { has: () => false });
    expect(check).toMatchObject({ name: "day rhythm", status: "ok" });
    expect(check.detail).toMatch(/off/i);
  });

  it("enabled + paired + registered + a sidecar timestamp → ok, reads all three sources", async () => {
    const { briefingSidecarFile, channelOwnersFile, configFile } = tmpFiles();
    writeFileSync(configFile, JSON.stringify({ dayRhythm: { enabled: true, eveningHour: 18, morningHour: 8 } }));
    writeFileSync(channelOwnersFile, JSON.stringify({ owners: { telegram: "555" }, version: 1 }));
    writeFileSync(briefingSidecarFile, JSON.stringify({ lastFiredAt: "2026-07-18T08:00:00Z" }));
    const check = await readDayRhythmDoctorCheck(configFile, channelOwnersFile, briefingSidecarFile, { has: (id) => id === "telegram" });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("telegram");
    expect(check.detail).toMatch(/last briefing delivered/);
  });

  it("enabled but the paired provider is not registered → warn (matches resolveSinglePairedChannel's fail-close)", async () => {
    const { briefingSidecarFile, channelOwnersFile, configFile } = tmpFiles();
    writeFileSync(configFile, JSON.stringify({ dayRhythm: { enabled: true, eveningHour: 18, morningHour: 8 } }));
    writeFileSync(channelOwnersFile, JSON.stringify({ owners: { telegram: "555" }, version: 1 }));
    const check = await readDayRhythmDoctorCheck(configFile, channelOwnersFile, briefingSidecarFile, { has: () => false });
    expect(check.status).toBe("warn");
  });
});
