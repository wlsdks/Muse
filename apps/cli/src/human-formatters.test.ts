import { describe, expect, it } from "vitest";
import { formatCitations, formatLocalDateTime } from "./human-formatters.js";

describe("formatCitations", () => {
  it("returns empty string when no citations", () => {
    expect(formatCitations(undefined)).toBe("");
    expect(formatCitations([])).toBe("");
  });

  it("renders numbered Sources block", () => {
    const out = formatCitations([
      { url: "https://a.test", title: "A" },
      { url: "https://b.test", title: "B" }
    ]);
    expect(out).toBe("\n\nSources:\n  [1] A — https://a.test\n  [2] B — https://b.test");
  });
});

describe("formatLocalDateTime", () => {
  it("renders a UTC instant in Asia/Seoul (JARVIS UX — '3pm tomorrow' must round-trip)", () => {
    // 2026-12-31T23:59:00Z is 2027-01-01 08:59 KST — a user who said
    // "midnight UTC" should not see 23:59; a user in KST who said
    // "9am" expects "09:00", not "00:00".
    expect(formatLocalDateTime("2026-12-31T23:59:00Z", "Asia/Seoul"))
      .toBe("2027-01-01 08:59");
    expect(formatLocalDateTime("2026-05-14T00:00:00Z", "Asia/Seoul"))
      .toBe("2026-05-14 09:00");
  });

  it("renders identity when the requested zone is UTC", () => {
    expect(formatLocalDateTime("2026-05-14T06:00:00Z", "UTC"))
      .toBe("2026-05-14 06:00");
  });

  it("returns the input unchanged for unparseable strings", () => {
    expect(formatLocalDateTime("not-a-date")).toBe("not-a-date");
    expect(formatLocalDateTime("short")).toBe("short");
  });

  it("zero-pads midnight in the host zone (Intl 'en-CA' quirk: hour can come back as 24)", () => {
    // Midnight in America/Los_Angeles is 2026-05-14T07:00:00Z
    expect(formatLocalDateTime("2026-05-14T07:00:00Z", "America/Los_Angeles"))
      .toBe("2026-05-14 00:00");
  });
});
