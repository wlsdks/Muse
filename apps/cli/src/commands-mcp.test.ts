import { describe, expect, it } from "vitest";

import { MCP_PRESETS } from "./commands-mcp.js";

describe("MCP_PRESETS.filesystem.build — refuses to default to filesystem root", () => {
  function withEnv(home: string | undefined, fn: () => void): void {
    const prev = process.env.HOME;
    if (home === undefined) delete process.env.HOME;
    else process.env.HOME = home;
    try { fn(); } finally {
      if (prev === undefined) delete process.env.HOME;
      else process.env.HOME = prev;
    }
  }

  it("uses --root verbatim when provided (trimmed)", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({ root: "/custom/path" });
      expect(entry.args?.[2]).toBe("/custom/path");
      expect(entry.description).toContain("/custom/path");
    });
  });

  it("trims a padded --root", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({ root: "  /padded  " });
      expect(entry.args?.[2]).toBe("/padded");
    });
  });

  it("falls back to HOME when --root is undefined", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({});
      expect(entry.args?.[2]).toBe("/u/jinan");
    });
  });

  it("falls back to HOME when --root is whitespace-only", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({ root: "   " });
      expect(entry.args?.[2]).toBe("/u/jinan");
    });
  });

  it("THROWS when both --root and HOME are empty — refuses to silently mount the MCP filesystem server at '/'", () => {
    withEnv("", () => {
      expect(() => MCP_PRESETS.filesystem!.build({})).toThrow(/--root <dir> is required.*refusing to default to filesystem root/u);
      expect(() => MCP_PRESETS.filesystem!.build({ root: "  " })).toThrow(/--root <dir> is required/u);
    });
  });

  it("THROWS when --root is undefined AND HOME is undefined (the original '? ?? \"/\"' silent-mount-at-root path)", () => {
    withEnv(undefined, () => {
      expect(() => MCP_PRESETS.filesystem!.build({})).toThrow(/--root <dir> is required/u);
    });
  });
});
