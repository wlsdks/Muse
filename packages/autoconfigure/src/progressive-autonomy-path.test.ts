import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveProgressiveAutonomyFile } from "./provider-paths.js";

describe("resolveProgressiveAutonomyFile", () => {
  it("resolves an isolated HOME and explicit override through the shared personal-store contract", () => {
    const isolatedHome = join(tmpdir(), "muse-autonomy-resolver-home");
    expect(resolveProgressiveAutonomyFile({ HOME: isolatedHome })).toBe(
      join(isolatedHome, ".muse", "progressive-autonomy.json")
    );
    expect(resolveProgressiveAutonomyFile({
      HOME: userInfo().homedir,
      MUSE_PROGRESSIVE_AUTONOMY_FILE: "/tmp/explicit-autonomy.json"
    })).toBe("/tmp/explicit-autonomy.json");
  });

  it("fails closed under Vitest when no override would resolve to the real account HOME", () => {
    expect(() => resolveProgressiveAutonomyFile({ HOME: userInfo().homedir })).toThrow(
      "MUSE_PROGRESSIVE_AUTONOMY_FILE store path would fall back to the REAL home"
    );
  });
});
