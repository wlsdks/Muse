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
});
