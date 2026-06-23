import { describe, expect, it } from "vitest";

import { applyToolCallMiddleware, type ToolCallMiddleware } from "../src/tool-call-middleware.js";

const call = (name: string, args: Record<string, unknown> = {}) => ({ id: `c-${name}`, name, arguments: args });

describe("applyToolCallMiddleware", () => {
  it("returns null when the chain is empty (no-op)", () => {
    expect(applyToolCallMiddleware(call("muse.fs.read"), [])).toBeNull();
  });

  it("returns null when every middleware allows", () => {
    const allow: ToolCallMiddleware = () => ({ action: "allow" });
    expect(applyToolCallMiddleware(call("muse.fs.read"), [allow, allow])).toBeNull();
  });

  it("returns the reason of the FIRST blocking middleware (short-circuits)", () => {
    const calls: string[] = [];
    const allowlist: ToolCallMiddleware = (tc) => {
      calls.push("allowlist");
      return tc.name.startsWith("muse.fs.") ? { action: "allow" } : { action: "block", reason: "tool not on sub-agent allowlist" };
    };
    const second: ToolCallMiddleware = () => {
      calls.push("second");
      return { action: "block", reason: "should not reach here" };
    };
    expect(applyToolCallMiddleware(call("web.fetch"), [allowlist, second])).toBe("tool not on sub-agent allowlist");
    expect(calls).toEqual(["allowlist"]); // short-circuited; second never ran
  });

  it("falls back to a generic reason when a middleware blocks with an empty reason", () => {
    const blockBlank: ToolCallMiddleware = () => ({ action: "block", reason: "   " });
    expect(applyToolCallMiddleware(call("x"), [blockBlank])).toBe("tool call blocked by policy");
  });

  it("can inspect arguments to decide", () => {
    const guard: ToolCallMiddleware = (tc) =>
      String((tc.arguments as { path?: unknown }).path ?? "").includes(".env")
        ? { action: "block", reason: "secret path denied" }
        : { action: "allow" };
    expect(applyToolCallMiddleware(call("muse.fs.read", { path: "src/a.ts" }), [guard])).toBeNull();
    expect(applyToolCallMiddleware(call("muse.fs.read", { path: "/app/.env" }), [guard])).toBe("secret path denied");
  });
});
