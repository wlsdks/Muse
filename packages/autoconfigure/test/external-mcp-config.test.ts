import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryMcpServerStore } from "@muse/mcp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConfigurationError,
  loadExternalMcpConfig,
  parseExternalMcpConfig,
  resolveExternalMcpConfigFile,
  seedExternalMcpServers
} from "../src/index.js";

describe("parseExternalMcpConfig", () => {
  it("parses an stdio entry into an McpServerInput", () => {
    const entries = parseExternalMcpConfig(JSON.stringify({
      mcpServers: {
        filesystem: {
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/notes"],
          command: "npx",
          env: { LOG_LEVEL: "info" }
        }
      }
    }));

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.name).toBe("filesystem");
    expect(entry.transportType).toBe("stdio");
    expect(entry.autoConnect).toBe(true);
    expect(entry.config).toMatchObject({
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/notes"],
      command: "npx",
      env: { LOG_LEVEL: "info" }
    });
  });

  it("parses a streamable URL entry and defaults transport to streamable when url is given", () => {
    const entries = parseExternalMcpConfig(JSON.stringify({
      mcpServers: {
        github: {
          headers: { Authorization: "Bearer token" },
          url: "https://api.githubcopilot.com/mcp/"
        }
      }
    }));

    expect(entries[0]).toMatchObject({
      autoConnect: true,
      config: {
        headers: { Authorization: "Bearer token" },
        url: "https://api.githubcopilot.com/mcp/"
      },
      name: "github",
      transportType: "streamable"
    });
  });

  it("honors an explicit transport: 'sse' override", () => {
    const entries = parseExternalMcpConfig(JSON.stringify({
      mcpServers: {
        analytics: {
          transport: "sse",
          url: "https://example.com/mcp/sse"
        }
      }
    }));

    expect(entries[0]?.transportType).toBe("sse");
  });

  it("skips entries with disabled: true without throwing", () => {
    const entries = parseExternalMcpConfig(JSON.stringify({
      mcpServers: {
        active: { command: "node", args: ["a.js"] },
        retired: { command: "node", args: ["b.js"], disabled: true }
      }
    }));

    expect(entries.map((entry) => entry.name)).toEqual(["active"]);
  });

  it("returns [] when mcpServers is missing", () => {
    expect(parseExternalMcpConfig("{}")).toEqual([]);
  });

  it("rejects an entry with neither command nor url", () => {
    expect(() => parseExternalMcpConfig(JSON.stringify({
      mcpServers: { ghost: { description: "no transport given" } }
    }))).toThrow(ConfigurationError);
  });

  it("rejects an explicit transport value that is not streamable or sse", () => {
    expect(() => parseExternalMcpConfig(JSON.stringify({
      mcpServers: { weird: { transport: "carrier-pigeon", url: "https://example.com" } }
    }))).toThrow(/streamable.*sse/);
  });

  it("rejects malformed JSON with ConfigurationError", () => {
    expect(() => parseExternalMcpConfig("{not json")).toThrow(ConfigurationError);
  });

  it("rejects non-string values inside env / headers maps", () => {
    expect(() => parseExternalMcpConfig(JSON.stringify({
      mcpServers: { fs: { command: "node", env: { TOKEN: 123 } } }
    }))).toThrow(/env\.TOKEN/);
  });
});

describe("resolveExternalMcpConfigFile", () => {
  it("uses MUSE_MCP_CONFIG when set", () => {
    const path = resolveExternalMcpConfigFile({ MUSE_MCP_CONFIG: "/custom/path/mcp.json" });
    expect(path).toBe("/custom/path/mcp.json");
  });

  it("defaults to ~/.muse/mcp.json when MUSE_MCP_CONFIG is unset", () => {
    const path = resolveExternalMcpConfigFile({});
    expect(path.endsWith("/.muse/mcp.json")).toBe(true);
  });
});

describe("loadExternalMcpConfig", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "muse-mcp-config-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { force: true, recursive: true });
  });

  it("returns an empty list when the file does not exist", () => {
    const entries = loadExternalMcpConfig({ MUSE_MCP_CONFIG: join(tmpRoot, "missing.json") });
    expect(entries).toEqual([]);
  });

  it("reads + parses a real file via MUSE_MCP_CONFIG override", () => {
    const path = join(tmpRoot, "mcp.json");
    writeFileSync(path, JSON.stringify({
      mcpServers: { fs: { command: "node", args: ["server.js"] } }
    }), "utf8");

    const entries = loadExternalMcpConfig({ MUSE_MCP_CONFIG: path });
    expect(entries.map((entry) => entry.name)).toEqual(["fs"]);
  });
});

describe("seedExternalMcpServers", () => {
  it("inserts new entries and skips already-registered names", async () => {
    const store = new InMemoryMcpServerStore();
    await store.save({
      autoConnect: true,
      config: { command: "existing" },
      name: "existing",
      transportType: "stdio"
    });

    const inserted = await seedExternalMcpServers(store, [
      { autoConnect: true, config: { command: "node" }, name: "fresh", transportType: "stdio" },
      { autoConnect: true, config: { command: "node" }, name: "existing", transportType: "stdio" }
    ]);

    expect(inserted).toEqual(["fresh"]);
    const all = await store.list();
    expect(all.map((entry) => entry.name).sort()).toEqual(["existing", "fresh"]);
  });

  it("returns [] when given no entries", async () => {
    const store = new InMemoryMcpServerStore();
    expect(await seedExternalMcpServers(store, [])).toEqual([]);
  });
});
