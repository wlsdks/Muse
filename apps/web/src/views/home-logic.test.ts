import { describe, expect, it } from "vitest";

import { dayRhythmCardState, homeCapabilities } from "./home-logic.js";
import { factLabel, groupFactsByValue } from "../lib/memory-labels.js";
import type { DayRhythmStateResponse } from "../api/types.js";

describe("homeCapabilities — entries appear only when actually available", () => {
  it("always offers the local-store capabilities", () => {
    const ids = homeCapabilities({ emailConfigured: false, threadCount: 0 }).map((c) => c.id);
    expect(ids).toEqual(["notes", "calendar", "reminder"]);
  });

  it("adds email only when configured", () => {
    const ids = homeCapabilities({ emailConfigured: true, threadCount: 0 }).map((c) => c.id);
    expect(ids).toContain("email");
  });

  it("adds thread resume only when a thread exists, navigating not prompting", () => {
    const caps = homeCapabilities({ emailConfigured: false, threadCount: 2 });
    const threads = caps.find((c) => c.id === "threads");
    expect(threads?.navigate).toBe("continuity");
    expect(threads?.promptKey).toBeUndefined();
  });
});

describe("dayRhythmCardState — three honest states, never a fourth guess", () => {
  it("an undefined response (not loaded yet) reads as off", () => {
    expect(dayRhythmCardState(undefined)).toEqual({ kind: "off" });
  });

  it("disabled reads as off regardless of hours/pairing", () => {
    const response: DayRhythmStateResponse = {
      enabled: false,
      eveningHour: 18,
      morningHour: 8,
      pairedChannel: { destination: "555", providerId: "telegram" }
    };
    expect(dayRhythmCardState(response)).toEqual({ kind: "off" });
  });

  it("enabled with no paired channel reads as unpaired, carrying the configured hours", () => {
    const response: DayRhythmStateResponse = { enabled: true, eveningHour: 19, morningHour: 7, pairedChannel: null };
    expect(dayRhythmCardState(response)).toEqual({ eveningHour: 19, kind: "unpaired", morningHour: 7 });
  });

  it("enabled with a paired channel reads as on, carrying the provider id", () => {
    const response: DayRhythmStateResponse = {
      enabled: true,
      eveningHour: 18,
      morningHour: 8,
      pairedChannel: { destination: "555", providerId: "telegram" }
    };
    expect(dayRhythmCardState(response)).toEqual({ eveningHour: 18, kind: "on", morningHour: 8, providerId: "telegram" });
  });
});

describe("factLabel — no raw snake_case in the UI", () => {
  it("maps known extractor keys per language", () => {
    expect(factLabel("dog_name", "ko")).toBe("강아지 이름");
    expect(factLabel("dog_name", "en")).toBe("Dog's name");
    expect(factLabel("user_name", "ko")).toBe("이름");
  });

  it("prettifies unknown keys instead of leaking snake_case", () => {
    expect(factLabel("favorite_editor", "ko")).toBe("Favorite editor");
    expect(factLabel("favorite_editor", "en")).toBe("Favorite editor");
  });
});

describe("groupFactsByValue — one entity, one row, nothing hidden", () => {
  it("merges keys sharing a value and keeps first-seen order", () => {
    const groups = groupFactsByValue({ user_name: "진안", dog_name: "보리", cat_name: "보리", pet_dog_name: "보리" });
    expect(groups).toEqual([
      { keys: ["user_name"], value: "진안" },
      { keys: ["dog_name", "cat_name", "pet_dog_name"], value: "보리" }
    ]);
  });

  it("keeps distinct values apart", () => {
    expect(groupFactsByValue({ a: "x", b: "y" })).toHaveLength(2);
  });

  it("handles empty facts", () => {
    expect(groupFactsByValue({})).toEqual([]);
  });
});
