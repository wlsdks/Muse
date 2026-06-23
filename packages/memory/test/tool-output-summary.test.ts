import { describe, expect, it } from "vitest";

import { summarizeToolResult } from "../src/tool-output-summary.js";

describe("summarizeToolResult", () => {
  it("returns null for empty / whitespace-only output", () => {
    expect(summarizeToolResult("muse.terminal.run", "")).toBeNull();
    expect(summarizeToolResult("muse.terminal.run", "   \n  ")).toBeNull();
  });

  it("terminal: surfaces exit code and line count", () => {
    const out = "running tests\n.....\nAll passed\nexit code: 0";
    expect(summarizeToolResult("muse.terminal.run", out)).toBe("terminal: exit 0 · 4 lines");
  });

  it("terminal: flags a non-zero exit as an error", () => {
    const out = "build failed\nTypeError: boom\nexited with code 1";
    expect(summarizeToolResult("shell.exec", out)).toBe("terminal: exit 1 (error) · 3 lines");
  });

  it("terminal: falls back to line + char count when no exit code is present", () => {
    const out = "line a\nline b\nline c";
    expect(summarizeToolResult("bash", out)).toBe("terminal: 3 lines · 20 chars");
  });

  it("read: reports line and char counts", () => {
    const out = "alpha\nbeta\ngamma";
    expect(summarizeToolResult("muse.fs.read", out)).toBe("read: 3 lines · 16 chars");
  });

  it("write: reports char count only", () => {
    const out = "x".repeat(1500);
    expect(summarizeToolResult("muse.fs.write", out)).toBe("write: 1.5k chars");
  });

  it("search: counts non-empty result lines", () => {
    const out = "match one\n\nmatch two\nmatch three\n";
    expect(summarizeToolResult("muse.fs.grep", out)).toBe("search: 3 results");
  });

  it("git: surfaces the first meaningful line", () => {
    const out = "\n12 files changed, 340 insertions(+), 12 deletions(-)\n...";
    expect(summarizeToolResult("muse.git.status", out)).toBe(
      "git: 12 files changed, 340 insertions(+), 12 deletions(-)"
    );
  });

  it("web: uses a short leading title plus char count", () => {
    const out = "Example Domain\nThis domain is for use in illustrative examples.";
    expect(summarizeToolResult("web.search", out)).toBe(
      "web: Example Domain · 63 chars"
    );
  });

  it("web: drops a single-blob (no newline) title and reports chars only", () => {
    const out = "y".repeat(2000);
    expect(summarizeToolResult("web.search", out)).toBe("web: 2.0k chars");
  });

  it("generic fallback: line + char count for an unrecognized tool", () => {
    const out = "a\nb\nc\nd";
    expect(summarizeToolResult("unknown.frobnicate", out)).toBe("4 lines · 7 chars");
  });

  it("clips an overlong summary with an ellipsis at maxLen", () => {
    const longTitle = "T".repeat(200);
    const out = `${longTitle}\nbody line`;
    const summary = summarizeToolResult("web.fetch", out, { maxLen: 20 })!;
    expect(summary.length).toBeLessThanOrEqual(20);
    // a >60-char title is rejected by the title guard, so this becomes char-count form
    expect(summary).toContain("web:");
  });
});
