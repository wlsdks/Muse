import { describe, expect, it } from "vitest";

import { episodeIndexHealth, messagingConfigCheck, notesIndexHealth, recallCalibrationCheck } from "./commands-doctor-checks.js";

describe("recallCalibrationCheck — surfaces the recall confidence floor's calibration posture", () => {
  it("ok + the calibrated bar for the v2-moe default embedder", () => {
    const r = recallCalibrationCheck("nomic-embed-text-v2-moe", {});
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("0.45");
    expect(r.detail).toContain("calibrated for nomic-embed-text-v2-moe");
  });

  it("ok + the 0.55 bar for the legacy nomic-embed-text", () => {
    const r = recallCalibrationCheck("nomic-embed-text", {});
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("0.55");
  });

  it("WARNS for an unknown embedder on the conservative fallback (may over-abstain)", () => {
    const r = recallCalibrationCheck("some-future-embedder", {});
    expect(r.status).toBe("warn");
    expect(r.detail).toContain("conservative fallback");
    expect(r.detail).toContain("0.55");
  });

  it("reports an explicit MUSE_GROUNDING_MIN_COSINE override (beats the embedder bar)", () => {
    const r = recallCalibrationCheck("nomic-embed-text-v2-moe", { MUSE_GROUNDING_MIN_COSINE: "0.62" });
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("0.62");
    expect(r.detail).toContain("MUSE_GROUNDING_MIN_COSINE");
  });
});

describe("messagingConfigCheck", () => {
  it("reports none configured (opt-in) and the wired providers", () => {
    expect(messagingConfigCheck({}).detail).toContain("no messaging provider");
    const wired = messagingConfigCheck({ MUSE_TELEGRAM_BOT_TOKEN: "t", MUSE_SLACK_BOT_TOKEN: "s" });
    expect(wired.detail).toContain("telegram");
    expect(wired.detail).toContain("slack");
    expect(wired.status).toBe("ok");
  });
});

describe("notesIndexHealth", () => {
  it("warns when absent or stale, ok when present+fresh", () => {
    expect(notesIndexHealth({ exists: false, stale: false }).status).toBe("warn");
    expect(notesIndexHealth({ exists: true, stale: true }).status).toBe("warn");
    expect(notesIndexHealth({ exists: true, stale: false }).status).toBe("ok");
  });
});

describe("episodeIndexHealth", () => {
  it("ok when none, warns when unindexed or lagging, ok when fully indexed", () => {
    expect(episodeIndexHealth({ episodeCount: 0, indexedCount: 0 }).status).toBe("ok");
    expect(episodeIndexHealth({ episodeCount: 5, indexedCount: 0 }).status).toBe("warn");
    expect(episodeIndexHealth({ episodeCount: 5, indexedCount: 3 }).status).toBe("warn");
    expect(episodeIndexHealth({ episodeCount: 5, indexedCount: 5 }).status).toBe("ok");
  });
});
