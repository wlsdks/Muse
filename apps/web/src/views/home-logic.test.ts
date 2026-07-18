import { describe, expect, it } from "vitest";

import { consumeAutoContinueThread, dayRhythmCardState, homeCapabilities, writeAutoContinueThread } from "./home-logic.js";
import { factLabel, groupFactsByValue } from "../lib/memory-labels.js";
import type { DayRhythmStateResponse } from "../api/types.js";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    clear: () => data.clear(),
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
}

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

describe("writeAutoContinueThread / consumeAutoContinueThread — one-shot Chat→Home Pack handoff", () => {
  it("consuming before any write returns undefined", () => {
    expect(consumeAutoContinueThread(memoryStorage())).toBeUndefined();
  });

  it("round-trips the written thread id", () => {
    const storage = memoryStorage();
    writeAutoContinueThread(storage, "thread_life");
    expect(consumeAutoContinueThread(storage)).toBe("thread_life");
  });

  it("is one-shot: a second consume after the first returns undefined (no repeat auto-continue on remount)", () => {
    const storage = memoryStorage();
    writeAutoContinueThread(storage, "thread_life");
    expect(consumeAutoContinueThread(storage)).toBe("thread_life");
    expect(consumeAutoContinueThread(storage)).toBeUndefined();
  });

  it("is a no-op / returns undefined for an undefined storage, never throwing", () => {
    expect(() => writeAutoContinueThread(undefined, "thread_life")).not.toThrow();
    expect(consumeAutoContinueThread(undefined)).toBeUndefined();
  });

  it("swallows a throwing storage instead of crashing the caller", () => {
    const throwing: Storage = {
      clear: () => undefined,
      getItem: () => {
        throw new Error("denied");
      },
      key: () => null,
      length: 0,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("denied");
      }
    };
    expect(() => writeAutoContinueThread(throwing, "thread_life")).not.toThrow();
    expect(consumeAutoContinueThread(throwing)).toBeUndefined();
  });
});
