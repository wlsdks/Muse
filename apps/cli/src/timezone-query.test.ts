import { describe, expect, it } from "vitest";

import { detectTimezoneQuery, formatTimezone } from "./timezone-query.js";

// A fixed winter instant (no US DST) so the offsets are deterministic:
// PST = UTC-8, EST = UTC-5, Seoul/Tokyo = UTC+9, London = UTC+0, UTC = 0.
const NOW = new Date("2026-01-15T12:00:00Z");

describe("detectTimezoneQuery — only a real timezone question short-circuits", () => {
  it("parses '<time> <zone> in/to <zone>' (abbreviations and cities)", () => {
    expect(detectTimezoneQuery("what's 3pm PST in EST?")).toMatchObject({ kind: "convert", minutes: 900 });
    expect(detectTimezoneQuery("convert 9am Seoul to Los Angeles")).toMatchObject({ kind: "convert", minutes: 540 });
    expect(detectTimezoneQuery("9:30am tokyo in new york")).toMatchObject({ kind: "convert", minutes: 570 });
  });

  it("parses 'what time is it in <zone>' (now)", () => {
    expect(detectTimezoneQuery("what time is it in Tokyo?")).toMatchObject({ kind: "now" });
    expect(detectTimezoneQuery("what's the time in London right now")).toMatchObject({ kind: "now" });
  });

  it("returns null when a named zone doesn't resolve or it isn't a timezone question", () => {
    expect(detectTimezoneQuery("what time is the meeting?")).toBeNull();      // "the meeting" isn't a zone
    expect(detectTimezoneQuery("how many people are coming?")).toBeNull();
    expect(detectTimezoneQuery("3pm in the afternoon")).toBeNull();          // "the afternoon" isn't a zone
    expect(detectTimezoneQuery("what's the budget?")).toBeNull();
  });
});

describe("formatTimezone — exact conversion against a fixed instant", () => {
  it("converts a time eastward, naming both zones", () => {
    const q = detectTimezoneQuery("3pm PST in EST")!;
    expect(formatTimezone(q, NOW)).toBe("3:00 PM Los Angeles is 6:00 PM in New York.");
  });

  it("rolls to the NEXT day across the date line (9am LA → Seoul)", () => {
    const q = detectTimezoneQuery("9am PST in Seoul")!;
    expect(formatTimezone(q, NOW)).toBe("9:00 AM Los Angeles is 2:00 AM in Seoul (next day).");
  });

  it("rolls to the PREVIOUS day going the other way (9am Seoul → LA)", () => {
    const q = detectTimezoneQuery("9am Seoul in Los Angeles")!;
    expect(formatTimezone(q, NOW)).toBe("9:00 AM Seoul is 4:00 PM in Los Angeles (previous day).");
  });

  it("answers the current time in a zone from the instant", () => {
    expect(formatTimezone(detectTimezoneQuery("what time is it in Tokyo")!, NOW)).toBe("It's 9:00 PM in Tokyo right now.");
    expect(formatTimezone(detectTimezoneQuery("what time is it in New York")!, NOW)).toBe("It's 7:00 AM in New York right now.");
  });
});
