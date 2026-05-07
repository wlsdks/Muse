import type { MuseDatabase } from "@muse/db";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler
} from "kysely";
import { describe, expect, it, vi } from "vitest";

import {
  createDefaultLoopbackMcpServers,
  createLoopbackMcpConnection,
  createLoopbackMcpMuseTools,
  createMathMcpServer,
  createMcpSecurityPolicyInsert,
  createMcpServerInsert,
  createMcpServerUpdate,
  createTextUtilsMcpServer,
  createTimeMcpServer,
  DefaultMcpTransportConnector,
  InMemoryMcpSecurityPolicyStore,
  InMemoryMcpServerStore,
  isPrivateOrReservedHost,
  isPublicHttpUrl,
  KyselyMcpSecurityPolicyStore,
  KyselyMcpServerStore,
  mapMcpSecurityPolicyRow,
  mapMcpServerRow,
  McpManager,
  McpSecurityPolicyProvider,
  normalizeMcpSecurityPolicy,
  validateMcpServer,
  validateStdioArgs,
  validateStdioCommand,
  type McpConnection
} from "../src/index.js";

describe("InMemoryMcpServerStore", () => {
  it("saves, updates, lists, and deletes MCP servers", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const store = new InMemoryMcpServerStore({
      idFactory: () => "server-1",
      now: () => now
    });

    const saved = store.save({
      config: { url: "https://example.test/mcp" },
      name: "research",
      transportType: "streamable"
    });
    const updated = store.update("research", {
      autoConnect: true,
      config: { command: "node" },
      name: "ignored",
      transportType: "stdio"
    });

    expect(saved).toMatchObject({
      id: "server-1",
      name: "research",
      transportType: "streamable"
    });
    expect(updated).toMatchObject({
      autoConnect: true,
      config: { command: "node" },
      id: "server-1",
      name: "research",
      transportType: "stdio"
    });
    expect(store.list()).toHaveLength(1);

    store.delete("research");
    expect(store.findByName("research")).toBeUndefined();
  });

  it("rejects duplicate names and evicts oldest entries when bounded", () => {
    const store = new InMemoryMcpServerStore({
      idFactory: sequentialIds("server"),
      maxServers: 1
    });

    store.save({ name: "first", transportType: "stdio", config: { command: "node" } });
    expect(() => store.save({ name: "first", transportType: "stdio", config: { command: "node" } })).toThrow(
      /already exists/
    );

    store.save({ name: "second", transportType: "stdio", config: { command: "node" } });
    expect(store.findByName("first")).toBeUndefined();
    expect(store.findByName("second")).toBeDefined();
  });
});

describe("MCP security policy", () => {
  it("normalizes allowlists and output length boundaries", () => {
    expect(
      normalizeMcpSecurityPolicy(
        {
          allowedServerNames: [" research ", "", "research"],
          allowedStdioCommands: [" node ", "node", ""],
          maxToolOutputLength: 1
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toMatchObject({
      allowedServerNames: ["research"],
      allowedStdioCommands: ["node"],
      maxToolOutputLength: 1_024
    });
  });

  it("stores and resolves dynamic policy over defaults", async () => {
    const store = new InMemoryMcpSecurityPolicyStore({
      initial: {
        allowedServerNames: ["research"]
      }
    });
    const provider = new McpSecurityPolicyProvider(store, {
      allowedServerNames: ["default"]
    });

    await expect(provider.isServerAllowed("research")).resolves.toBe(true);
    await expect(provider.isServerAllowed("default")).resolves.toBe(false);

    store.delete();
    await expect(provider.isServerAllowed("default")).resolves.toBe(true);
  });

  it("validates remote URLs and stdio commands with fail-close defaults", () => {
    const policy = normalizeMcpSecurityPolicy({ allowedStdioCommands: ["node"] }, new Date());

    expect(isPrivateOrReservedHost("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedHost("localhost")).toBe(true);
    expect(isPrivateOrReservedHost("8.8.8.8")).toBe(false);
    expect(isPublicHttpUrl("https://example.test/mcp")).toBe(true);
    expect(isPublicHttpUrl("http://127.0.0.1/mcp")).toBe(false);
    expect(
      validateMcpServer(
        {
          autoConnect: false,
          config: { command: "sh" },
          createdAt: new Date(),
          id: "server-1",
          name: "local",
          transportType: "stdio",
          updatedAt: new Date()
        },
        policy
      )
    ).toMatchObject({ valid: false });
    expect(validateStdioCommand("node", "local", policy)).toBe(true);
    expect(validateStdioCommand("./node", "local", policy)).toBe(false);
    expect(validateStdioCommand("node/child", "local", policy)).toBe(false);
    expect(validateStdioArgs(["--input-type=module", "line\nbreak"], "local")).toBe(true);
    expect(validateStdioArgs([`bad${String.fromCharCode(0)}`], "local")).toBe(false);
  });

  it("allows private remote MCP URLs only when explicitly configured", () => {
    expect(isPublicHttpUrl("http://127.0.0.1/mcp")).toBe(false);
    expect(isPublicHttpUrl("http://127.0.0.1/mcp", { allowPrivateAddresses: true })).toBe(true);
  });
});

describe("DefaultMcpTransportConnector", () => {
  it("connects stdio MCP servers and calls tools through the SDK client", async () => {
    const serverCode = [
      'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
      'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
      'const server = new McpServer({ name: "fixture-mcp", version: "1.0.0" });',
      'server.registerTool("ping", { description: "Ping tool" }, async () => ({',
      '  content: [{ type: "text", text: "pong" }]',
      "}));",
      "await server.connect(new StdioServerTransport());"
    ].join("\n");
    const policy = normalizeMcpSecurityPolicy({ allowedStdioCommands: ["node"] }, new Date());
    const connector = new DefaultMcpTransportConnector({
      requestTimeoutMs: 5_000,
      stderr: "pipe"
    });
    const connection = await connector.connect(
      {
        autoConnect: false,
        config: {
          args: ["--input-type=module", "-e", serverCode],
          command: "node"
        },
        createdAt: new Date(),
        id: "server-1",
        name: "local",
        transportType: "stdio",
        updatedAt: new Date()
      },
      policy
    );

    try {
      expect(await connection.listTools()).toMatchObject([
        {
          description: "Ping tool",
          name: "ping",
          risk: "read"
        }
      ]);
      await expect(connection.callTool?.("ping", {})).resolves.toBe("pong");
    } finally {
      await connection.close?.();
    }
  });
});

describe("McpManager", () => {
  it("connects allowed servers and projects MCP tools into Muse tools", async () => {
    const connection: McpConnection = {
      callTool: async (toolName, args) => ({ args, toolName }),
      listTools: () => [
        {
          description: "Read a file",
          inputSchema: { type: "object" },
          name: "read_file",
          risk: "read"
        }
      ]
    };
    const manager = new McpManager(new InMemoryMcpServerStore(), {
      connector: {
        connect: async () => connection
      }
    });

    await manager.register({
      config: { command: "node" },
      name: "local",
      transportType: "stdio"
    });

    await expect(manager.connect("local")).resolves.toBe(true);
    expect(manager.getStatus("local")).toBe("connected");
    expect(manager.getToolCatalog()).toEqual([
      {
        description: "Read a file",
        inputSchema: { type: "object" },
        name: "read_file",
        risk: "read"
      }
    ]);

    const [tool] = manager.toMuseTools();
    expect(tool?.definition).toMatchObject({
      name: "local.read_file",
      risk: "read"
    });
    await expect(tool?.execute({ path: "docs/input.md" }, { runId: "run-1" })).resolves.toEqual({
      args: { path: "docs/input.md" },
      toolName: "read_file"
    });
  });

  it("marks denied or invalid servers without throwing", async () => {
    const store = new InMemoryMcpServerStore();
    const policyStore = new InMemoryMcpSecurityPolicyStore({
      initial: {
        allowedServerNames: ["allowed"]
      }
    });
    const manager = new McpManager(store, {
      securityPolicyProvider: new McpSecurityPolicyProvider(policyStore)
    });

    await expect(
      manager.register({
        config: { command: "node" },
        name: "blocked",
        transportType: "stdio"
      })
    ).resolves.toBeUndefined();
    expect(manager.getStatus("blocked")).toBe("disabled");
  });

  it("tracks health failures and reconnects due servers with backoff", async () => {
    let nowMs = 1_767_228_800_000;
    const firstConnection: McpConnection = {
      close: vi.fn(),
      listTools: vi.fn()
        .mockResolvedValueOnce([{ description: "Ping", name: "ping", risk: "read" }])
        .mockRejectedValueOnce(new Error("connection lost"))
    };
    const secondConnection: McpConnection = {
      listTools: vi.fn().mockResolvedValue([{ description: "Ping v2", name: "ping", risk: "read" }])
    };
    const connector = {
      connect: vi.fn()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection)
    };
    const manager = new McpManager(new InMemoryMcpServerStore(), {
      connector,
      now: () => new Date(nowMs),
      reconnect: {
        initialDelayMs: 100,
        maxAttempts: 2
      }
    });

    await manager.register({
      config: { command: "node" },
      name: "local",
      transportType: "stdio"
    });

    await expect(manager.connect("local")).resolves.toBe(true);
    await expect(manager.healthCheck("local")).resolves.toMatchObject({
      error: "connection lost",
      reconnectAttempts: 1,
      status: "unhealthy"
    });
    expect(firstConnection.close).toHaveBeenCalledOnce();
    expect(manager.getStatus("local")).toBe("failed");
    expect(await manager.reconnectDue()).toEqual([]);

    nowMs += 100;
    await expect(manager.reconnectDue()).resolves.toEqual([
      expect.objectContaining({
        reconnectAttempts: 0,
        status: "healthy",
        toolCount: 1
      })
    ]);
    expect(connector.connect).toHaveBeenCalledTimes(2);
    expect(manager.getStatus("local")).toBe("connected");
  });

  it("reports local preflight diagnostics before live MCP execution", async () => {
    const policyStore = new InMemoryMcpSecurityPolicyStore({
      initial: {
        allowedServerNames: ["local"],
        allowedStdioCommands: ["node"]
      }
    });
    const manager = new McpManager(new InMemoryMcpServerStore(), {
      securityPolicyProvider: new McpSecurityPolicyProvider(policyStore)
    });

    await manager.register({
      config: { command: "node" },
      name: "local",
      transportType: "stdio"
    });
    await manager.register({
      config: { command: "node" },
      name: "blocked",
      transportType: "stdio"
    });

    await expect(manager.preflight("local")).resolves.toMatchObject({
      ok: true,
      readyForProduction: false,
      serverName: "local",
      summary: { failCount: 0, warnCount: 2 }
    });
    await expect(manager.preflight("blocked")).resolves.toMatchObject({
      ok: false,
      serverName: "blocked",
      summary: { failCount: 1 }
    });
    await expect(manager.preflight("missing")).resolves.toMatchObject({
      ok: false,
      serverName: "missing",
      summary: { failCount: 1 }
    });
  });
});

describe("Kysely MCP stores", () => {
  it("builds and maps MCP server persistence payloads", () => {
    const db = createPostgresBuilder();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const insert = createMcpServerInsert(
      {
        config: { url: "https://example.test/mcp" },
        name: "remote",
        transportType: "streamable"
      },
      { idFactory: () => "server-1", now: () => now }
    );
    const update = createMcpServerUpdate(
      {
        autoConnect: true,
        config: { command: "node" },
        name: "remote",
        transportType: "stdio"
      },
      () => now
    );
    const compiled = db.insertInto("mcp_servers").values(insert).returningAll().compile();

    expect(compiled.sql).toContain('insert into "mcp_servers"');
    expect(insert).toMatchObject({
      config: { url: "https://example.test/mcp" },
      id: "server-1",
      name: "remote",
      transport_type: "streamable"
    });
    expect(update).toMatchObject({
      auto_connect: true,
      config: { command: "node" },
      transport_type: "stdio"
    });
    expect(mapMcpServerRow(insert)).toMatchObject({
      id: "server-1",
      name: "remote",
      transportType: "streamable"
    });
  });

  it("builds and maps MCP security policy persistence payloads", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const insert = createMcpSecurityPolicyInsert(
      {
        allowedServerNames: ["remote"],
        allowedStdioCommands: ["node"],
        maxToolOutputLength: 60_000
      },
      () => now
    );

    expect(insert).toMatchObject({
      allowed_server_names: ["remote"],
      allowed_stdio_commands: ["node"],
      id: "default",
      max_tool_output_length: 60_000
    });
    expect(mapMcpSecurityPolicyRow(insert)).toMatchObject({
      allowedServerNames: ["remote"],
      allowedStdioCommands: ["node"],
      maxToolOutputLength: 60_000
    });
  });

  it("constructs Kysely stores", () => {
    const db = createPostgresBuilder();

    expect(new KyselyMcpServerStore(db)).toBeDefined();
    expect(new KyselyMcpSecurityPolicyStore(db)).toBeDefined();
  });
});

function sequentialIds(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function createPostgresBuilder(): Kysely<MuseDatabase> {
  return new Kysely<MuseDatabase>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler()
    }
  });
}

describe("loopback MCP servers", () => {
  it("createDefaultLoopbackMcpServers ships time, text, and math servers by default", () => {
    const servers = createDefaultLoopbackMcpServers({ now: () => new Date("2026-05-15T00:00:00.000Z") });
    expect(servers.map((server) => server.name).sort()).toEqual(["muse.math", "muse.text", "muse.time"]);
    for (const server of servers) {
      expect(server.tools.length).toBeGreaterThan(0);
    }
  });

  it("createLoopbackMcpConnection returns the registered tools through listTools()", async () => {
    const server = createTimeMcpServer({ now: () => new Date("2026-05-15T00:00:00.000Z") });
    const connection = createLoopbackMcpConnection(server);
    const tools = await connection.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["diff_ms", "now"]);
  });

  it("muse.time#now returns ISO + epoch + day-of-week using the injected clock", async () => {
    const server = createTimeMcpServer({ now: () => new Date("2026-05-07T01:23:45.000Z") });
    const connection = createLoopbackMcpConnection(server);
    const result = await connection.callTool!("now", {});
    expect(result).toMatchObject({ dayOfWeek: "Thursday", iso: "2026-05-07T01:23:45.000Z" });
  });

  it("muse.time#diff_ms computes the signed millisecond difference", async () => {
    const server = createTimeMcpServer();
    const connection = createLoopbackMcpConnection(server);
    expect(
      await connection.callTool!("diff_ms", {
        from: "2026-05-07T00:00:00.000Z",
        to: "2026-05-07T00:01:30.000Z"
      })
    ).toEqual({ milliseconds: 90_000 });
  });

  it("muse.text#stats counts words/characters/lines and treats whitespace as zero", async () => {
    const server = createTextUtilsMcpServer();
    const connection = createLoopbackMcpConnection(server);
    expect(await connection.callTool!("stats", { text: "hello\nworld\nfrom muse" })).toEqual({
      characters: 21,
      lines: 3,
      words: 4
    });
    expect(await connection.callTool!("stats", { text: "   " })).toEqual({ characters: 0, lines: 0, words: 0 });
  });

  it("muse.text#reverse reverses the input safely", async () => {
    const server = createTextUtilsMcpServer();
    const connection = createLoopbackMcpConnection(server);
    expect(await connection.callTool!("reverse", { text: "muse" })).toEqual({ reversed: "esum" });
  });

  it("muse.math#evaluate accepts safe arithmetic and rejects unsafe characters", async () => {
    const server = createMathMcpServer();
    const connection = createLoopbackMcpConnection(server);
    expect(await connection.callTool!("evaluate", { expression: "2 + 3 * 4" })).toEqual({
      expression: "2 + 3 * 4",
      result: 14
    });
    expect(await connection.callTool!("evaluate", { expression: "1 + globalThis" })).toEqual({
      error: expect.stringContaining("digits, parentheses")
    });
    expect(await connection.callTool!("evaluate", { expression: "1 / 0" })).toEqual({
      error: expect.stringContaining("division by zero")
    });
  });

  it("returns a structured error when an unknown tool is called", async () => {
    const server = createMathMcpServer();
    const connection = createLoopbackMcpConnection(server);
    expect(await connection.callTool!("nonexistent", {})).toMatch(/not registered on 'muse\.math'/u);
  });

  it("createLoopbackMcpMuseTools wraps each tool with the <server>.<tool> namespace", async () => {
    const server = createMathMcpServer();
    const tools = createLoopbackMcpMuseTools(server);
    expect(tools.map((tool) => tool.definition.name)).toEqual(["muse.math.evaluate"]);
    const evaluator = tools[0]!;
    const result = await evaluator.execute({ expression: "10 / 2" }, { runId: "run-1" });
    expect(result).toEqual({ expression: "10 / 2", result: 5 });
  });

  it("close() resolves without error for loopback connections", async () => {
    const connection = createLoopbackMcpConnection(createTimeMcpServer());
    await expect(connection.close!()).resolves.toBeUndefined();
  });

  it("muse.time#now returns an error payload when the timezone is unsupported", async () => {
    const server = createTimeMcpServer();
    const connection = createLoopbackMcpConnection(server);
    expect(await connection.callTool!("now", { timezone: "Mars/Olympus" })).toEqual({
      error: expect.stringContaining("unsupported timezone")
    });
  });
});
