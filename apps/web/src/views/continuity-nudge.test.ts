import { describe, expect, it } from "vitest";

import { continuityNudgeFor, dismissNudge, isNudgeDismissed } from "./continuity-nudge.js";

import type { ReviewThreadsPayload } from "./continuity-nudge.js";

/** Minimal in-memory Storage fake — no jsdom/window dependency, so this
 * suite runs under plain node:test-style vitest without a DOM. */
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

describe("continuityNudgeFor — names a thread only when its Pack is actually resumable", () => {
  it("returns undefined for an undefined review (still loading / errored)", () => {
    expect(continuityNudgeFor(undefined)).toBeUndefined();
  });

  it("returns undefined when the review reports no threads", () => {
    expect(continuityNudgeFor({ threads: [] })).toBeUndefined();
  });

  it("returns undefined when the only thread has no linked local source", () => {
    const review: ReviewThreadsPayload = {
      threads: [{ id: "t1", kind: "life", linkCount: 0, links: [], title: "Untouched thread" }]
    };
    expect(continuityNudgeFor(review)).toBeUndefined();
  });

  it("returns undefined when the only thread's sources are all external (needs the CLI)", () => {
    const review: ReviewThreadsPayload = {
      threads: [{
        id: "t1",
        kind: "work",
        linkCount: 1,
        links: [{ artifactId: "n1", artifactType: "note", providerId: "notion", role: "context" }],
        title: "External-only thread"
      }]
    };
    expect(continuityNudgeFor(review)).toBeUndefined();
  });

  it("names the first resumable thread's id + title", () => {
    const review: ReviewThreadsPayload = {
      threads: [
        {
          id: "t_external",
          kind: "work",
          linkCount: 1,
          links: [{ artifactId: "n1", artifactType: "note", providerId: "notion", role: "context" }],
          title: "External-only thread"
        },
        {
          id: "t_local",
          kind: "life",
          linkCount: 1,
          links: [{ artifactId: "task_1", artifactType: "task", providerId: "local", role: "next-step" }],
          title: "Prepare birthday"
        }
      ]
    };
    expect(continuityNudgeFor(review)).toEqual({ threadId: "t_local", title: "Prepare birthday" });
  });
});

describe("isNudgeDismissed / dismissNudge — one-shot session suppression", () => {
  it("is not dismissed before any dismissal is recorded", () => {
    expect(isNudgeDismissed(memoryStorage())).toBe(false);
  });

  it("becomes dismissed after dismissNudge, and stays dismissed across repeated reads (one-shot, not one-time-only)", () => {
    const storage = memoryStorage();
    dismissNudge(storage);
    expect(isNudgeDismissed(storage)).toBe(true);
    expect(isNudgeDismissed(storage)).toBe(true);
  });

  it("a fresh storage (new tab session) is never pre-dismissed by another instance's state", () => {
    const dismissedStorage = memoryStorage();
    dismissNudge(dismissedStorage);
    const freshStorage = memoryStorage();
    expect(isNudgeDismissed(freshStorage)).toBe(false);
  });

  it("treats an undefined storage (SSR / storage unavailable) as not dismissed, never throwing", () => {
    expect(isNudgeDismissed(undefined)).toBe(false);
    expect(() => dismissNudge(undefined)).not.toThrow();
  });

  it("swallows a throwing storage instead of crashing the nudge", () => {
    const throwing: Storage = {
      clear: () => undefined,
      getItem: () => {
        throw new Error("quota/private-mode denial");
      },
      key: () => null,
      length: 0,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error("quota/private-mode denial");
      }
    };
    expect(isNudgeDismissed(throwing)).toBe(false);
    expect(() => dismissNudge(throwing)).not.toThrow();
  });
});
