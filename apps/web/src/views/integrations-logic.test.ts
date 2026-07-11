import { describe, expect, it } from "vitest";

import { canDisconnect, daemonBadge, providerStatus, requiresHomeserver } from "./integrations-logic.js";

import type { MessagingSetupProvider } from "../api/types.js";

const base: MessagingSetupProvider = {
  configured: false,
  displayName: "Telegram",
  docsUrl: "https://core.telegram.org/bots#botfather",
  id: "telegram",
  registered: false,
  source: null
};

describe("providerStatus", () => {
  it("unconfigured → neutral 'not connected'", () => {
    expect(providerStatus(base)).toEqual({ labelKey: "int.status.notConnected", tone: "neutral" });
  });

  it("file-sourced → ok 'connected'", () => {
    expect(providerStatus({ ...base, configured: true, registered: true, source: "file" }))
      .toEqual({ labelKey: "int.status.connected", tone: "ok" });
  });

  it("env-sourced → ok 'connected via env'", () => {
    expect(providerStatus({ ...base, configured: true, registered: true, source: "env" }))
      .toEqual({ labelKey: "int.status.connectedEnv", tone: "ok" });
  });

  it("configured but not live-registered yet → warn (needs restart or reconnect)", () => {
    expect(providerStatus({ ...base, configured: true, registered: false, source: "file" }))
      .toEqual({ labelKey: "int.status.savedNotLive", tone: "warn" });
  });
});

describe("requiresHomeserver", () => {
  it("only matrix needs a homeserver URL alongside the token", () => {
    expect(requiresHomeserver("matrix")).toBe(true);
    expect(requiresHomeserver("telegram")).toBe(false);
    expect(requiresHomeserver("discord")).toBe(false);
    expect(requiresHomeserver("slack")).toBe(false);
    expect(requiresHomeserver("line")).toBe(false);
  });
});

describe("canDisconnect", () => {
  it("only a file-sourced credential can be disconnected from the UI", () => {
    expect(canDisconnect({ ...base, configured: true, source: "file" })).toBe(true);
    expect(canDisconnect({ ...base, configured: true, source: "env" })).toBe(false);
    expect(canDisconnect(base)).toBe(false);
  });
});

describe("daemonBadge", () => {
  const flag = (enabled: boolean, running?: boolean) => ({
    enabled,
    key: "MUSE_TELEGRAM_POLL_ENABLED",
    label: "Telegram inbound polling",
    ...(running !== undefined ? { running } : {})
  });

  it("enabled + running → ok 'running'", () => {
    expect(daemonBadge(flag(true, true))).toEqual({ labelKey: "int.daemon.running", tone: "ok" });
  });

  it("enabled but NOT running → warn (the truthful lying-badge fix)", () => {
    expect(daemonBadge(flag(true, false))).toEqual({ labelKey: "int.daemon.enabledNotRunning", tone: "warn" });
  });

  it("disabled → neutral 'off' regardless of running info", () => {
    expect(daemonBadge(flag(false, false))).toEqual({ labelKey: "int.daemon.off", tone: "neutral" });
    expect(daemonBadge(flag(false))).toEqual({ labelKey: "int.daemon.off", tone: "neutral" });
  });

  it("enabled without running info keeps the plain 'on' (older servers)", () => {
    expect(daemonBadge(flag(true))).toEqual({ labelKey: "int.daemon.on", tone: "ok" });
  });
});
