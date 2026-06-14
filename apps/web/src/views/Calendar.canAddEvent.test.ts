import { describe, expect, it } from "vitest";

import { canAddEvent } from "./Calendar.js";

describe("canAddEvent — the new-event form guard requires a valid time range", () => {
  const start = "2026-06-20T14:00";

  it("allows a well-formed event (end after start)", () => {
    expect(canAddEvent("Standup", start, "2026-06-20T15:00")).toBe(true);
  });

  it("blocks an end BEFORE the start (a backwards / negative-duration event)", () => {
    expect(canAddEvent("Standup", start, "2026-06-20T13:00")).toBe(false);
  });

  it("blocks a zero-length event (end equal to start)", () => {
    expect(canAddEvent("Standup", start, start)).toBe(false);
  });

  it("still requires a non-empty title, start, and end", () => {
    expect(canAddEvent("", start, "2026-06-20T15:00")).toBe(false);
    expect(canAddEvent("Standup", "", "2026-06-20T15:00")).toBe(false);
    expect(canAddEvent("Standup", start, "")).toBe(false);
  });
});
