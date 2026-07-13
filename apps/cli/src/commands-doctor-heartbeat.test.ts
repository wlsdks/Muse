import { describe, expect, it } from "vitest";

import { heartbeatStatusToCheckStatus, proactiveHeartbeatCheck } from "./commands-doctor-heartbeat.js";

const nowMs = Date.parse("2026-07-01T10:10:00Z");
const mark = (iso: string) => ({ at: iso, pid: 1 });

describe("proactiveHeartbeatCheck — doctor surfacing per heartbeat state", () => {
  it("healthy (alive+fired fresh) → ok", () => {
    const check = proactiveHeartbeatCheck(
      { alive: mark("2026-07-01T10:09:30Z"), fired: mark("2026-07-01T10:09:31Z") },
      { nowMs }
    );
    expect(check).toMatchObject({ name: "proactive heartbeat", status: "ok" });
  });

  it("failing (alive fresh, fired stale) → warn", () => {
    const check = proactiveHeartbeatCheck(
      { alive: mark("2026-07-01T10:09:30Z"), fired: mark("2026-07-01T09:40:00Z") },
      { nowMs }
    );
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/failing/i);
  });

  it("dead (alive stale) → warn", () => {
    const check = proactiveHeartbeatCheck(
      { alive: mark("2026-07-01T09:00:00Z"), fired: mark("2026-07-01T09:00:00Z") },
      { nowMs }
    );
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/stopped/i);
  });

  it("no heartbeat — the daemon has NEVER run — is a warning, not a clean bill of health", () => {
    // This test used to assert `ok`, under the name "no false alarm". It was not a
    // false alarm; it was the alarm. The daemon does not auto-start, so "never ran"
    // is the DEFAULT state of every install — and it is the state in which decay,
    // skill merge, consolidation, reflection and pattern detection have never
    // executed for anyone. A green tick on that is how it stayed unnoticed.
    const check = proactiveHeartbeatCheck({}, { nowMs });
    expect(check.status).toBe("warn");
  });
});

describe("heartbeatStatusToCheckStatus", () => {
  it("maps every status — not knowing whether it ever ran is not health", () => {
    expect(heartbeatStatusToCheckStatus("healthy")).toBe("ok");
    expect(heartbeatStatusToCheckStatus("unknown")).toBe("warn");
    expect(heartbeatStatusToCheckStatus("failing")).toBe("warn");
    expect(heartbeatStatusToCheckStatus("dead")).toBe("warn");
  });
});
