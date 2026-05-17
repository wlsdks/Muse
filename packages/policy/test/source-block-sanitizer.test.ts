import { describe, expect, it } from "vitest";
import { sanitizeSourceBlocks } from "../src/index.js";

describe("sanitizeSourceBlocks", () => {
  it("removes copied linked source sections at the end of a response", () => {
    const result = sanitizeSourceBlocks([
      "The answer is 42.",
      "",
      "Sources:",
      "- [Invoice docs](https://example.test/invoice)"
    ].join("\n"));

    expect(result).toEqual({
      content: "The answer is 42.",
      reason: "linked_source_block",
      removed: true
    });
  });

  it("removes empty fallback source sections", () => {
    const result = sanitizeSourceBlocks([
      "I do not have enough evidence.",
      "",
      "Sources:",
      "- No verified sources."
    ].join("\n"));

    expect(result).toEqual({
      content: "I do not have enough evidence.",
      reason: "empty_source_block",
      removed: true
    });
  });

  it("keeps narrative source mentions that are not a source list", () => {
    const result = sanitizeSourceBlocks("Sources: this word appears in the user-provided sentence.");

    expect(result).toEqual({
      content: "Sources: this word appears in the user-provided sentence.",
      removed: false
    });
  });

  it("strips an inline empty fallback on the heading line itself", () => {
    expect(sanitizeSourceBlocks("Answer is 42.\n\nSources: none")).toEqual({
      content: "Answer is 42.",
      reason: "empty_source_block",
      removed: true
    });
  });

  it("strips a bare dangling heading at end-of-response (truncated section)", () => {
    expect(sanitizeSourceBlocks("The answer.\n\nSources:")).toEqual({
      content: "The answer.",
      reason: "empty_source_block",
      removed: true
    });
  });

  it("strips only the trailing fallback, keeping a real cited block above it", () => {
    expect(
      sanitizeSourceBlocks("Answer.\n\nSources:\n- https://example.com/x\n\nReferences: none")
    ).toEqual({
      content: "Answer.\n\nSources:\n- https://example.com/x",
      reason: "empty_source_block",
      removed: true
    });
  });

  it("does NOT remove when real content follows a Sources:-looking line (over-removal guard)", () => {
    const input = "Sources: see below\nReal content paragraph.\nMore real content.";
    expect(sanitizeSourceBlocks(input)).toEqual({ content: input, removed: false });
  });

  it("treats a doi:/arxiv: reference list as a linked source block", () => {
    expect(sanitizeSourceBlocks("Done.\nReferences:\n[1] doi:10.1/abc")).toEqual({
      content: "Done.",
      reason: "linked_source_block",
      removed: true
    });
  });
});
