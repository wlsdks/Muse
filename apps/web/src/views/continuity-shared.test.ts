import { describe, expect, it } from "vitest";

import { firstResumableThread, isThreadResumable } from "./continuity-shared.js";

import type { ReviewThreadSummary } from "./continuity-shared.js";

function thread(overrides: Partial<ReviewThreadSummary> = {}): ReviewThreadSummary {
  return {
    id: "thread_1",
    kind: "life",
    linkCount: 1,
    links: [{ artifactId: "task_1", artifactType: "task", providerId: "local", role: "next-step" }],
    title: "Prepare birthday",
    ...overrides
  };
}

describe("isThreadResumable — a Pack can be opened inline only with a local-only link set", () => {
  it("is false when the thread has no linked source", () => {
    expect(isThreadResumable(thread({ linkCount: 0, links: [] }))).toBe(false);
  });

  it("is true when every link is local", () => {
    expect(isThreadResumable(thread())).toBe(true);
  });

  it("is false when any link is an external source (needs the CLI's live MCP check)", () => {
    expect(isThreadResumable(thread({
      links: [
        { artifactId: "task_1", artifactType: "task", providerId: "local", role: "context" },
        { artifactId: "note_1", artifactType: "note", providerId: "notion", role: "context" }
      ]
    }))).toBe(false);
  });

});

describe("firstResumableThread — server order, first eligible wins", () => {
  it("returns undefined for an empty or undefined list", () => {
    expect(firstResumableThread(undefined)).toBeUndefined();
    expect(firstResumableThread([])).toBeUndefined();
  });

  it("skips a non-resumable thread and returns the next one", () => {
    const external = thread({ id: "thread_ext", links: [{ artifactId: "n", artifactType: "note", providerId: "notion", role: "context" }] });
    const local = thread({ id: "thread_local" });
    expect(firstResumableThread([external, local])?.id).toBe("thread_local");
  });

  it("returns undefined when no thread is resumable", () => {
    const external = thread({ links: [{ artifactId: "n", artifactType: "note", providerId: "notion", role: "context" }] });
    expect(firstResumableThread([external])).toBeUndefined();
  });
});
