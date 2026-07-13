import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import * as externalMcpConfig from "../src/external-mcp-config.js";
import { assembleMcpStack } from "../src/mcp-stack.js";
import * as officialMcpCredentials from "../src/official-mcp-credentials.js";

describe("assembleMcpStack — MUSE_LOCAL_ONLY external MCP closure", () => {
  it("short-circuits config, Chrome, and official credential assembly under local-only", async () => {
    const root = mkdtempSync(join(tmpdir(), "muse-mcp-stack-local-only-"));
    const configPath = join(root, "invalid-mcp.json");
    // If `loadExternalMcpConfig` is reached this is a loud parse error. The
    // local-only branch must return before any config/preset credential work.
    writeFileSync(configPath, "{", "utf8");
    const loadExternalMcpConfig = vi.spyOn(externalMcpConfig, "loadExternalMcpConfig");
    const resolveOfficialMcpAuthHeaders = vi.spyOn(officialMcpCredentials, "resolveOfficialMcpAuthHeaders");

    try {
      const stack = assembleMcpStack({
        GITHUB_MCP_TOKEN: "secret-not-to-read",
        MUSE_CHROME_DEVTOOLS_ENABLED: "true",
        MUSE_GITHUB_MCP_ENABLED: "true",
        MUSE_LOCAL_ONLY: "true",
        MUSE_MCP_ALLOW_PRIVATE_ADDRESSES: "true",
        MUSE_MCP_CONFIG: configPath
      }, undefined);

      expect(stack.externalServerInputs).toEqual([]);
      expect(stack.manager.isExternalTransportAllowed()).toBe(false);
      expect(loadExternalMcpConfig).not.toHaveBeenCalled();
      expect(resolveOfficialMcpAuthHeaders).not.toHaveBeenCalled();
      await expect(stack.manager.register({
        config: { url: "http://127.0.0.1:3000/mcp" },
        name: "cannot-widen-local-only",
        transportType: "streamable"
      })).resolves.toBeUndefined();
    } finally {
      loadExternalMcpConfig.mockRestore();
      resolveOfficialMcpAuthHeaders.mockRestore();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps external config and official presets available when local-only is explicitly false", () => {
    const root = mkdtempSync(join(tmpdir(), "muse-mcp-stack-normal-"));
    const configPath = join(root, "mcp.json");
    writeFileSync(configPath, JSON.stringify({
      mcpServers: {
        "configured-remote": { transport: "streamable", url: "https://example.invalid/mcp" }
      }
    }), "utf8");

    try {
      const stack = assembleMcpStack({
        GITHUB_MCP_TOKEN: "test-token",
        MUSE_GITHUB_MCP_ENABLED: "true",
        MUSE_LOCAL_ONLY: "false",
        MUSE_MCP_CONFIG: configPath
      }, undefined);

      expect(stack.manager.isExternalTransportAllowed()).toBe(true);
      expect(stack.externalServerInputs.map((server) => server.name)).toContain("configured-remote");
      expect(stack.externalServerInputs.map((server) => server.name)).toContain("github");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
