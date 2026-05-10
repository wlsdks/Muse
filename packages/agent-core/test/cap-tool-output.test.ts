import { describe, expect, it } from "vitest";

import { InMemoryContextReferenceStore } from "@muse/memory";

import { capToolOutput } from "../src/model-loop.js";

describe("capToolOutput", () => {
  it("returns the output unchanged when no cap is configured", () => {
    const output = "x".repeat(2_000);
    expect(capToolOutput(output, "muse.fs.read", undefined)).toBe(output);
    expect(capToolOutput(output, "muse.fs.read", 0)).toBe(output);
  });

  it("trims oversized output with a hint that names the tool", () => {
    const output = "y".repeat(2_000);
    const trimmed = capToolOutput(output, "web.search", 200);
    expect(trimmed.length).toBeLessThanOrEqual(200);
    expect(trimmed).toContain("tool web.search returned a larger result");
    expect(trimmed).not.toContain("ref=");
  });

  it("stashes oversized output in the ref store and surfaces ref=<id> in the marker", () => {
    const store = new InMemoryContextReferenceStore();
    const output = "abcdef".repeat(2_000);
    const trimmed = capToolOutput(output, "muse.fs.read", 300, store);

    const refMatch = /ref=([0-9a-f]{12})/.exec(trimmed);
    expect(refMatch).not.toBeNull();
    const ref = refMatch![1];
    expect(trimmed).toContain("muse.context.fetch({ ref })");
    const stashed = store.get(ref);
    expect(stashed).toBeDefined();
    expect(stashed?.content).toBe(output);
    expect(stashed?.source).toBe("muse.fs.read");
    expect(stashed?.originalLength).toBe(output.length);
  });

  it("dedupes identical content via sha256-prefixed ids", () => {
    const store = new InMemoryContextReferenceStore();
    const output = "z".repeat(4_000);
    const first = /ref=([0-9a-f]{12})/.exec(capToolOutput(output, "tool.a", 300, store))?.[1];
    const second = /ref=([0-9a-f]{12})/.exec(capToolOutput(output, "tool.b", 300, store))?.[1];
    expect(first).toBeDefined();
    expect(first).toBe(second);
    expect(store.list()).toHaveLength(1);
  });

  it("does not stash content that already fits the cap", () => {
    const store = new InMemoryContextReferenceStore();
    const output = "small";
    const trimmed = capToolOutput(output, "tool.a", 100, store);
    expect(trimmed).toBe(output);
    expect(store.list()).toHaveLength(0);
  });
});
