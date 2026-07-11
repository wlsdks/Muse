import { describe, expect, it } from "vitest";

import { createChannelDaemonSupervisor } from "../src/channel-daemon-supervisor.js";

// The truthful-status seam: the settings/integrations surfaces must report
// whether a channel daemon is ACTUALLY running (a live handle), never just
// whether its env flag is set — a flag-on/daemon-dead mismatch is exactly
// the lying badge the UX evaluation flagged.

describe("createChannelDaemonSupervisor", () => {
  it("reports running=true only while a live handle is registered", () => {
    const supervisor = createChannelDaemonSupervisor();
    expect(supervisor.isRunning("telegram-poll")).toBe(false);

    supervisor.adopt("telegram-poll", { stop: () => undefined });
    expect(supervisor.isRunning("telegram-poll")).toBe(true);

    supervisor.stop("telegram-poll");
    expect(supervisor.isRunning("telegram-poll")).toBe(false);
  });

  it("adopting a replacement handle stops the previous one (no orphan daemons)", () => {
    const supervisor = createChannelDaemonSupervisor();
    let firstStopped = false;
    supervisor.adopt("telegram-poll", { stop: () => { firstStopped = true; } });
    supervisor.adopt("telegram-poll", { stop: () => undefined });
    expect(firstStopped).toBe(true);
    expect(supervisor.isRunning("telegram-poll")).toBe(true);
  });

  it("status() snapshots every known daemon with running state and notes", () => {
    const supervisor = createChannelDaemonSupervisor();
    supervisor.adopt("telegram-poll", { stop: () => undefined });
    supervisor.noteIngest("telegram-poll", 3);
    supervisor.noteError("matrix-sync", "sync failed");

    const status = supervisor.status();
    expect(status["telegram-poll"]).toMatchObject({ running: true });
    expect(typeof status["telegram-poll"]?.lastIngestAtIso).toBe("string");
    expect(status["matrix-sync"]).toMatchObject({ lastError: "sync failed", running: false });
  });

  it("stopAll halts everything (server onClose seam)", () => {
    const supervisor = createChannelDaemonSupervisor();
    const stops: string[] = [];
    supervisor.adopt("a", { stop: () => stops.push("a") });
    supervisor.adopt("b", { stop: () => stops.push("b") });
    supervisor.stopAll();
    expect(stops.sort()).toEqual(["a", "b"]);
    expect(supervisor.isRunning("a")).toBe(false);
  });
});
