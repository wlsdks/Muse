import { describe, expect, it } from "vitest";

import { computeDoctorChecks, DOCTOR_FIXES, type DoctorInput } from "./doctor-checks.js";

// The doctor is the deterministic "why is Muse not answering?" surface.
// Every verdict must be reproducible from the input snapshot — these pin
// the exact failure classes it exists for (2026-07-12 incident: telegram
// connected, poll running, reply daemon off → 👀 with no answer).

const flag = (key: string, enabled: boolean, running?: boolean, lastError?: string) => ({
  key,
  enabled,
  ...(running !== undefined ? { running } : {}),
  ...(lastError !== undefined ? { lastError } : {})
});

const NOW = "2026-07-12T01:00:00.000Z";

const base: DoctorInput = {
  connectedChannels: ["telegram"],
  flags: [
    flag("MUSE_TELEGRAM_POLL_ENABLED", true, true),
    flag("MUSE_INBOUND_REPLY_ENABLED", true, true)
  ],
  nowIso: NOW,
  ollamaReachable: true,
  unrepliedCount: 0
};

describe("computeDoctorChecks", () => {
  it("all healthy → single ok check", () => {
    const checks = computeDoctorChecks(base);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ id: "all-clear", severity: "ok" });
  });

  it("reply daemon off while channel connected + polling → error with enable fix and backlog count", () => {
    const checks = computeDoctorChecks({
      ...base,
      flags: [flag("MUSE_TELEGRAM_POLL_ENABLED", true, true), flag("MUSE_INBOUND_REPLY_ENABLED", false, false)],
      unrepliedCount: 4
    });
    const replyOff = checks.find((c) => c.id === "inbound-reply-off");
    expect(replyOff).toMatchObject({ severity: "error", fix: { id: "enable-inbound-reply" } });
    expect(replyOff?.detail).toContain("4개");
  });

  it("poll daemon off while channel connected → error with enable fix (and no reply-off duplicate)", () => {
    const checks = computeDoctorChecks({
      ...base,
      flags: [flag("MUSE_TELEGRAM_POLL_ENABLED", false, false), flag("MUSE_INBOUND_REPLY_ENABLED", false, false)]
    });
    expect(checks.find((c) => c.id === "telegram-poll-off")).toMatchObject({
      fix: { id: "enable-telegram-poll" },
      severity: "error"
    });
    expect(checks.find((c) => c.id === "inbound-reply-off")).toBeUndefined();
  });

  it("no connected channel → daemon-off checks stay silent", () => {
    const checks = computeDoctorChecks({
      ...base,
      connectedChannels: [],
      flags: [flag("MUSE_TELEGRAM_POLL_ENABLED", false, false), flag("MUSE_INBOUND_REPLY_ENABLED", false, false)]
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]?.id).toBe("all-clear");
  });

  it("getUpdates Conflict lastError → multi-instance warning", () => {
    const checks = computeDoctorChecks({
      ...base,
      flags: [
        flag("MUSE_TELEGRAM_POLL_ENABLED", true, true, "telegram-poll: Telegram getUpdates failed: Conflict: terminated by other getUpdates request"),
        flag("MUSE_INBOUND_REPLY_ENABLED", true, true)
      ]
    });
    const conflict = checks.find((c) => c.id === "MUSE_TELEGRAM_POLL_ENABLED-conflict");
    expect(conflict?.severity).toBe("warn");
    expect(conflict?.fix).toBeUndefined();
  });

  it("non-conflict lastError → generic daemon warning carrying the message", () => {
    const checks = computeDoctorChecks({
      ...base,
      flags: [
        flag("MUSE_TELEGRAM_POLL_ENABLED", true, true, "boom"),
        flag("MUSE_INBOUND_REPLY_ENABLED", true, true)
      ]
    });
    expect(checks.find((c) => c.id === "MUSE_TELEGRAM_POLL_ENABLED-error")?.detail).toBe("boom");
  });

  it("a stale lastError (older than the freshness window) is a resolved incident, not a warning", () => {
    const staleFlag = {
      ...flag("MUSE_TELEGRAM_POLL_ENABLED", true, true, "getUpdates failed: Conflict"),
      lastErrorAtIso: "2026-07-12T00:50:00.000Z"
    };
    const fresh = { ...staleFlag, lastErrorAtIso: "2026-07-12T00:59:00.000Z" };
    const replyOn = flag("MUSE_INBOUND_REPLY_ENABLED", true, true);
    expect(
      computeDoctorChecks({ ...base, flags: [staleFlag, replyOn] }).find((c) => c.id.endsWith("-conflict"))
    ).toBeUndefined();
    expect(
      computeDoctorChecks({ ...base, flags: [fresh, replyOn] }).find((c) => c.id.endsWith("-conflict"))
    ).toBeDefined();
  });

  it("ollama unreachable → error; undefined probe → silent", () => {
    expect(
      computeDoctorChecks({ ...base, ollamaReachable: false }).find((c) => c.id === "ollama-unreachable")?.severity
    ).toBe("error");
    const { ollamaReachable: _omitted, ...rest } = base;
    expect(computeDoctorChecks(rest).find((c) => c.id === "ollama-unreachable")).toBeUndefined();
  });

  it("running=false wins over enabled=true (a flag is intent, the handle is truth)", () => {
    const checks = computeDoctorChecks({
      ...base,
      flags: [flag("MUSE_TELEGRAM_POLL_ENABLED", true, true), flag("MUSE_INBOUND_REPLY_ENABLED", true, false)]
    });
    expect(checks.find((c) => c.id === "inbound-reply-off")).toBeDefined();
  });
});

describe("DOCTOR_FIXES", () => {
  it("every fix id emitted by a check is in the allowlist", () => {
    const emitted = computeDoctorChecks({
      ...base,
      flags: [flag("MUSE_TELEGRAM_POLL_ENABLED", false, false), flag("MUSE_INBOUND_REPLY_ENABLED", false, false)]
    })
      .map((c) => c.fix?.id)
      .filter((id): id is string => Boolean(id));
    expect(emitted.length).toBeGreaterThan(0);
    for (const id of emitted) {
      expect(DOCTOR_FIXES[id]).toBeTruthy();
    }
  });
});
