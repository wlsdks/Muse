/**
 * Regression guard for Gap #4 (audit re-diagnosis).
 *
 * `MUSE_CACHE_BOUNDARY_MARKER` is currently dormant — no caller
 * sets `includeCacheBoundary=true` and no provider adapter
 * translates the marker into Anthropic `cache_control`. But IF it
 * were enabled, the boundary must sit BELOW the stable prefix and
 * ABOVE the dynamic sections so Phases 1+2+3 (which are appended
 * downstream via `appendSystemSection`) land in the dynamic /
 * uncached half. This test pins that contract so a future refactor
 * doesn't silently move the boundary above the dynamic content.
 */

import { describe, expect, it } from "vitest";

import {
  buildSystemPrompt,
  MUSE_CACHE_BOUNDARY_MARKER,
  splitPromptCacheBoundary
} from "../src/index.js";

describe("cache boundary position guard (Gap #4)", () => {
  it("places the boundary AFTER the stable prefix and BEFORE the dynamic sections", () => {
    const prompt = buildSystemPrompt({
      basePrompt: "STABLE BASE PROMPT",
      includeCacheBoundary: true,
      retrievedContext: "DYNAMIC RETRIEVED CONTENT",
      userMemoryContext: "DYNAMIC USER MEMORY"
    });
    expect(prompt).toContain(MUSE_CACHE_BOUNDARY_MARKER);
    const split = splitPromptCacheBoundary(prompt);
    expect(split).toBeDefined();
    expect(split?.stablePrefix).toContain("STABLE BASE PROMPT");
    expect(split?.stablePrefix).not.toContain("DYNAMIC RETRIEVED CONTENT");
    expect(split?.stablePrefix).not.toContain("DYNAMIC USER MEMORY");
    expect(split?.dynamicSuffix).toContain("DYNAMIC RETRIEVED CONTENT");
    expect(split?.dynamicSuffix).toContain("DYNAMIC USER MEMORY");
  });

  it("appended sections (via downstream appendSystemSection) end up after the boundary", () => {
    // Simulate the agent-core pattern: buildSystemPrompt produces the
    // base + boundary, then appendSystemSection-style append happens
    // downstream. The appended text MUST follow the boundary so it
    // sits in the dynamic / uncached half.
    const base = buildSystemPrompt({
      basePrompt: "STABLE",
      includeCacheBoundary: true
    });
    const downstreamAppend = `${base}\n\n<!-- muse:active-context -->\n[Active Context]\nnow=...`;
    const split = splitPromptCacheBoundary(downstreamAppend);
    expect(split?.dynamicSuffix).toContain("[Active Context]");
    expect(split?.stablePrefix).not.toContain("[Active Context]");
  });
});
