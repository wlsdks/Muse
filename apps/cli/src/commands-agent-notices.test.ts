import { describe, expect, it } from "vitest";

import { formatNoticeStamp } from "./commands-agent-notices.js";

describe("formatNoticeStamp — notice timestamps render in the user's local zone, not raw UTC", () => {
  it("converts a UTC ISO stamp into local HH:MM (Asia/Seoul = UTC+9)", () => {
    // The producer stamps UTC; a raw slice(11,16) would show "14:30".
    expect(formatNoticeStamp("2026-05-24T14:30:00Z", "Asia/Seoul")).toBe("23:30");
  });

  it("honours the zone for a pre-midnight rollover (UTC 23:30 → next-day 08:30 KST)", () => {
    expect(formatNoticeStamp("2026-05-24T23:30:00Z", "Asia/Seoul")).toBe("08:30");
  });

  it("formats in UTC when asked (sanity: matches the wall-clock hour)", () => {
    expect(formatNoticeStamp("2026-05-24T14:30:00Z", "UTC")).toBe("14:30");
  });

  it("returns ??:?? for a missing or unparseable stamp instead of a garbled substring", () => {
    expect(formatNoticeStamp(undefined, "UTC")).toBe("??:??");
    expect(formatNoticeStamp("", "UTC")).toBe("??:??");
    expect(formatNoticeStamp("not-a-date", "UTC")).toBe("??:??");
  });
});
