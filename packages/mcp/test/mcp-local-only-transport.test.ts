import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  DefaultMcpTransportConnector,
  InMemoryMcpServerStore,
  MCP_EXTERNAL_TRANSPORT_BLOCKED,
  McpExternalTransportBlockedError,
  McpManager,
  normalizeMcpSecurityPolicy,
  type McpServer,
  type McpServerInput
} from "../src/index.js";

function storedServer(
  name: string,
  transportType: McpServer["transportType"],
  config: McpServer["config"],
  autoConnect = false
): McpServerInput {
  return { autoConnect, config, name, transportType };
}

function hostileConfig(onRead: () => void): McpServer["config"] {
  return new Proxy({} as McpServer["config"], {
    get() {
      onRead();
      throw new Error("persisted MCP config must not be read under local-only");
    }
  });
}

describe("McpManager — local-only external transport closure", () => {
  it("denies every external transport before validation, persistence, connector, or OSV work", async () => {
    const store = new InMemoryMcpServerStore();
    const connector = { connect: vi.fn(async () => { throw new Error("connector must not run"); }) };
    const osvFetch = vi.fn();
    const manager = new McpManager(store, {
      connector,
      externalTransportAllowed: false,
      osvMalwareCheck: { fetchImpl: osvFetch },
      validation: { allowPrivateAddresses: true }
    });
    const save = vi.spyOn(store, "save");

    for (const [name, transportType, config] of [
      ["blocked-stdio", "stdio", { command: "node" }],
      ["blocked-sse", "sse", { url: "http://127.0.0.1:3000/sse" }],
      ["blocked-streamable", "streamable", { url: "http://127.0.0.1:3000/mcp" }],
      ["blocked-http", "http", { url: "https://example.invalid/mcp" }]
    ] as const) {
      await expect(manager.register(storedServer(name, transportType, config))).resolves.toBeUndefined();
      expect(manager.getStatus(name)).toBe("disabled");
      expect(manager.getHealth(name)).toMatchObject({
        errorCode: MCP_EXTERNAL_TRANSPORT_BLOCKED,
        status: "unhealthy"
      });
    }

    expect(save).not.toHaveBeenCalled();
    expect(connector.connect).not.toHaveBeenCalled();
    expect(osvFetch).not.toHaveBeenCalled();
    expect(manager.isExternalTransportAllowed()).toBe(false);
  });

  it("does not update an already persisted server when external transport is blocked", async () => {
    const store = new InMemoryMcpServerStore();
    await store.save(storedServer("persisted", "stdio", { command: "node" }));
    const update = vi.spyOn(store, "update");
    const connector = { connect: vi.fn(async () => { throw new Error("connector must not run"); }) };
    const manager = new McpManager(store, { connector, externalTransportAllowed: false });

    await expect(manager.syncRuntimeServer(storedServer("persisted", "stdio", { command: "node", args: ["--version"] })))
      .resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
    expect(connector.connect).not.toHaveBeenCalled();
    expect(manager.getStatus("persisted")).toBe("disabled");
  });

  it("materializes raw persisted rows as disabled without dereferencing their config or connecting", async () => {
    const store = new InMemoryMcpServerStore();
    const configReads = vi.fn();
    await store.save(storedServer("raw-stdio", "stdio", hostileConfig(configReads), true));
    await store.save(storedServer("raw-streamable", "streamable", hostileConfig(configReads), false));
    const connector = { connect: vi.fn(async () => { throw new Error("connector must not run"); }) };
    const manager = new McpManager(store, { connector, externalTransportAllowed: false });

    const rows = await manager.listServers();
    const due = await manager.reconnectDue();
    const preflight = await manager.preflight("raw-stdio");

    expect(rows.map((row) => row.name)).toEqual(["raw-stdio", "raw-streamable"]);
    expect(rows.map((row) => manager.getStatus(row.name))).toEqual(["disabled", "disabled"]);
    expect(due).toHaveLength(2);
    expect(due).toEqual(expect.arrayContaining([
      expect.objectContaining({ errorCode: MCP_EXTERNAL_TRANSPORT_BLOCKED, serverName: "raw-stdio", status: "unhealthy" }),
      expect.objectContaining({ errorCode: MCP_EXTERNAL_TRANSPORT_BLOCKED, serverName: "raw-streamable", status: "unhealthy" })
    ]));
    expect(preflight).toMatchObject({
      ok: false,
      status: "disabled",
      health: { errorCode: MCP_EXTERNAL_TRANSPORT_BLOCKED, status: "unhealthy" },
      checks: expect.arrayContaining([
        expect.objectContaining({ code: "external_mcp_transport", status: "fail" })
      ])
    });
    expect(manager.toMuseTools()).toEqual([]);
    expect(configReads).not.toHaveBeenCalled();
    expect(connector.connect).not.toHaveBeenCalled();
  });
});

describe("DefaultMcpTransportConnector — local-only direct-call backstop", () => {
  it("refuses before DNS, SDK, or stdio spawn and keeps the stdio sentinel absent", async () => {
    const connector = new DefaultMcpTransportConnector({ externalTransportAllowed: false });
    const policy = normalizeMcpSecurityPolicy({ allowedStdioCommands: [process.execPath] }, new Date());
    const sentinel = join(tmpdir(), `muse-mcp-local-only-${process.pid.toString()}-${Date.now().toString()}`);
    rmSync(sentinel, { force: true });

    try {
      await expect(connector.connect({
        autoConnect: false,
        config: {
          args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "spawned")`],
          command: process.execPath
        },
        createdAt: new Date(),
        id: "blocked-stdio",
        name: "blocked-stdio",
        transportType: "stdio",
        updatedAt: new Date()
      }, policy)).rejects.toMatchObject({ code: MCP_EXTERNAL_TRANSPORT_BLOCKED });

      await expect(connector.connect({
        autoConnect: false,
        config: hostileConfig(() => { throw new Error("connector read remote config"); }),
        createdAt: new Date(),
        id: "blocked-remote",
        name: "blocked-remote",
        transportType: "streamable",
        updatedAt: new Date()
      }, policy)).rejects.toBeInstanceOf(McpExternalTransportBlockedError);

      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(sentinel, { force: true });
    }
  });
});
