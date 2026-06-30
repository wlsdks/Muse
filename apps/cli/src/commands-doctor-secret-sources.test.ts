import { describe, expect, it } from "vitest";

import { secretSourcesCheck } from "./commands-doctor-checks.js";

describe("secretSourcesCheck", () => {
  it("lists keychain on darwin + legacy store fallback, never a value", () => {
    const check = secretSourcesCheck({ MUSE_SECRET_TG: "should-not-appear" }, "darwin");
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("keychain (macOS)");
    expect(check.detail).toContain("legacy store (fallback)");
    expect(check.detail).toContain("env (1 MUSE_SECRET_* set)");
    // Posture line must NEVER include the value.
    expect(check.detail.includes("should-not-appear")).toBe(false);
  });

  it("omits keychain off-darwin and env when none set", () => {
    const check = secretSourcesCheck({}, "linux");
    expect(check.detail).not.toContain("keychain");
    expect(check.detail).not.toContain("MUSE_SECRET_");
    expect(check.detail).toContain("legacy store (fallback)");
  });
});
