import { describe, expect, it } from "vitest";

import { unwrapErrorMessage } from "../src/server.js";

describe("unwrapErrorMessage", () => {
  it("returns 'Agent run failed' for non-Error values", () => {
    expect(unwrapErrorMessage("nope")).toBe("Agent run failed");
    expect(unwrapErrorMessage(undefined)).toBe("Agent run failed");
    expect(unwrapErrorMessage(null)).toBe("Agent run failed");
  });

  it("returns the message for a single Error with no cause", () => {
    expect(unwrapErrorMessage(new Error("upstream 404"))).toBe("upstream 404");
  });

  it("joins the cause chain so the operator sees retry-wrapped Gemini errors", () => {
    const inner = new Error("Gemini request failed with 404: model not found");
    const middle = Object.assign(new Error("model provider error"), { cause: inner });
    const outer = Object.assign(new Error("Retry attempts exhausted after 3 attempt(s)"), {
      cause: middle
    });
    expect(unwrapErrorMessage(outer)).toBe(
      "Retry attempts exhausted after 3 attempt(s) — model provider error — Gemini request failed with 404: model not found"
    );
  });

  it("guards against a cyclic cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(unwrapErrorMessage(a)).toBe("a — b");
  });
});
