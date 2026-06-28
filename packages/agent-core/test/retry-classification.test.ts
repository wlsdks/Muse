import { ModelProviderError } from "@muse/model";
import { describe, expect, it } from "vitest";

import { isRetryableProviderError } from "../src/runtime-helpers.js";

describe("isRetryableProviderError — programming bugs fail fast, transients retry", () => {
  it("trusts ModelProviderError.retryable (the source of truth)", () => {
    expect(isRetryableProviderError(new ModelProviderError("ollama", "503", true))).toBe(true);
    expect(isRetryableProviderError(new ModelProviderError("ollama", "404", false))).toBe(false);
  });

  it("a PROGRAMMING error fails fast (never transient — don't burn retries on a bug)", () => {
    expect(isRetryableProviderError(new TypeError("x is not a function"))).toBe(false);
    expect(isRetryableProviderError(new ReferenceError("y is not defined"))).toBe(false);
    expect(isRetryableProviderError(new SyntaxError("bad json"))).toBe(false);
    expect(isRetryableProviderError(new RangeError("out of range"))).toBe(false);
  });

  it("a generic/unknown error STILL retries (CLAUDE.md: 'unknown errors MAY retry')", () => {
    expect(isRetryableProviderError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableProviderError("a string blip")).toBe(true);
    expect(isRetryableProviderError(undefined)).toBe(true);
  });
});
