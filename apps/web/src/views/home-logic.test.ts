import { describe, expect, it } from "vitest";

import { homeCapabilities } from "./home-logic.js";
import { factLabel } from "../lib/memory-labels.js";

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
