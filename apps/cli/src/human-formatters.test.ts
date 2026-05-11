import { describe, expect, it } from "vitest";
import { formatCitations } from "./human-formatters.js";

describe("formatCitations", () => {
  it("returns empty string when no citations", () => {
    expect(formatCitations(undefined)).toBe("");
    expect(formatCitations([])).toBe("");
  });

  it("renders numbered Sources block", () => {
    const out = formatCitations([
      { url: "https://a.test", title: "A" },
      { url: "https://b.test", title: "B" }
    ]);
    expect(out).toBe("\n\nSources:\n  [1] A — https://a.test\n  [2] B — https://b.test");
  });
});
