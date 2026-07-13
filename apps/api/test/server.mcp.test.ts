import { describe, expect, it, vi } from "vitest";
import { DefaultMcpTransportConnector, InMemoryMcpSecurityPolicyStore, InMemoryMcpServerStore, MCP_EXTERNAL_TRANSPORT_BLOCKED, McpManager, McpSecurityPolicyProvider, type McpConnection, type McpServer } from "@muse/mcp";
import { buildServer } from "../src/server.js";
import { createFakeMcpAdminServer, createMcpFixtureServerCode } from "./helpers/fake-mcp-admin-server.js";
import { createAuthService } from "./helpers/test-auth.js";

describe("api server: MCP", () => {
  it("materializes persisted local-only rows and denies external MCP routes/proxies before config or fetch", async () => {
    const authService = createAuthService();
    const registered = authService.register({
      email: "local_only",
      name: "Local Only",
      password: "password-1"
    });
    const policyStore = new InMemoryMcpSecurityPolicyStore();
    const securityPolicyProvider = new McpSecurityPolicyProvider(policyStore);
    const store = new InMemoryMcpServerStore({ idFactory: () => "raw-mcp" });
    const configReads = vi.fn();
    const hostileConfig = new Proxy({} as McpServer["config"], {
      get() {
        configReads();
        throw new Error("local-only API must not dereference persisted MCP config");
      }
    });
    await store.save({
      autoConnect: true,
      config: hostileConfig,
      name: "persisted",
      transportType: "streamable"
    });
    const connector = { connect: vi.fn(async () => { throw new Error("connector must not run"); }) };
    const manager = new McpManager(store, {
      connector,
      externalTransportAllowed: false,
      securityPolicyProvider
    });
    const server = buildServer({
      authService,
      logger: false,
      mcp: { manager, securityPolicyProvider, securityPolicyStore: policyStore },
      requireAuth: true
    });
    const headers = { authorization: `Bearer ${registered.token}` };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("compatibility proxy fetch must not run under local-only");
    });

    try {
      const list = await server.inject({ headers, method: "GET", url: "/api/mcp/servers" });
      const health = await server.inject({ headers, method: "GET", url: "/api/mcp/servers/persisted/health" });
      const preflight = await server.inject({ headers, method: "GET", url: "/api/mcp/servers/persisted/preflight" });
      const accessResponses = await Promise.all([
        server.inject({ headers, method: "GET", url: "/api/mcp/servers/persisted/access-policy" }),
        server.inject({ headers, method: "PUT", payload: { allowPreviewReads: true }, url: "/api/mcp/servers/persisted/access-policy" }),
        server.inject({ headers, method: "DELETE", url: "/api/mcp/servers/persisted/access-policy" }),
        server.inject({ headers, method: "POST", url: "/api/mcp/servers/persisted/access-policy/emergency-deny-all" })
      ]);
      const swaggerResponses = await Promise.all([
        server.inject({ headers, method: "GET", url: "/api/mcp/servers/persisted/swagger/sources" }),
        server.inject({ headers, method: "GET", url: "/api/mcp/servers/persisted/swagger/sources/orders" }),
        server.inject({ headers, method: "POST", payload: { name: "orders", url: "https://example.invalid/openapi.json" }, url: "/api/mcp/servers/persisted/swagger/sources" }),
        server.inject({ headers, method: "PUT", payload: {}, url: "/api/mcp/servers/persisted/swagger/sources/orders" }),
        server.inject({ headers, method: "POST", url: "/api/mcp/servers/persisted/swagger/sources/orders/sync" }),
        server.inject({ headers, method: "POST", payload: { revisionId: "rev-1" }, url: "/api/mcp/servers/persisted/swagger/sources/orders/publish" }),
        server.inject({ headers, method: "GET", url: "/api/mcp/servers/persisted/swagger/sources/orders/revisions?limit=1" }),
        server.inject({ headers, method: "GET", url: "/api/mcp/servers/persisted/swagger/sources/orders/diff?from=one&to=two" })
      ]);
      const invalidRegister = await server.inject({ headers, method: "POST", payload: {}, url: "/api/mcp/servers" });
      const register = await server.inject({
        headers,
        method: "POST",
        payload: { config: { command: "node" }, name: "new-server", transportType: "stdio" },
        url: "/api/mcp/servers"
      });
      const connect = await server.inject({ headers, method: "POST", url: "/api/mcp/servers/persisted/connect" });
      const missingConnect = await server.inject({ headers, method: "POST", url: "/api/mcp/servers/missing/connect" });
      const reconnect = await server.inject({ headers, method: "POST", url: "/api/mcp/servers/persisted/reconnect" });
      const reconnectDue = await server.inject({ headers, method: "POST", url: "/api/mcp/reconnect-due" });
      const invalidToolCall = await server.inject({ headers, method: "POST", payload: {}, url: "/api/mcp/servers/missing/tools/unknown/call" });
      const toolCall = await server.inject({ headers, method: "POST", payload: { args: {} }, url: "/api/mcp/servers/missing/tools/unknown/call" });
      const disconnect = await server.inject({ headers, method: "POST", url: "/api/mcp/servers/persisted/disconnect" });
      const deleted = await server.inject({ headers, method: "DELETE", url: "/api/mcp/servers/persisted" });

      expect(list.statusCode).toBe(200);
      expect(list.json()).toMatchObject([{ name: "persisted", status: "DISABLED" }]);
      expect(health.json()).toMatchObject({ errorCode: MCP_EXTERNAL_TRANSPORT_BLOCKED, status: "unhealthy" });
      expect(preflight.statusCode).toBe(200);
      expect(preflight.json()).toMatchObject({
        ok: false,
        checks: expect.arrayContaining([expect.objectContaining({ code: "external_mcp_transport", status: "fail" })])
      });
      for (const response of [...accessResponses, ...swaggerResponses]) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ code: MCP_EXTERNAL_TRANSPORT_BLOCKED });
      }
      expect(invalidRegister.statusCode).toBe(400);
      expect(register.statusCode).toBe(403);
      expect(register.json()).toMatchObject({ code: MCP_EXTERNAL_TRANSPORT_BLOCKED });
      expect(connect.statusCode).toBe(403);
      expect(missingConnect.statusCode).toBe(404);
      expect(reconnect.statusCode).toBe(403);
      expect(reconnectDue.statusCode).toBe(403);
      expect(invalidToolCall.statusCode).toBe(400);
      expect(toolCall.statusCode).toBe(403);
      expect(toolCall.json()).toMatchObject({ code: MCP_EXTERNAL_TRANSPORT_BLOCKED });
      expect(disconnect.statusCode).toBe(200);
      expect(deleted.statusCode).toBe(204);
      expect(configReads).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(connector.connect).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      await server.close();
    }
  });

  it("manages MCP servers, policies, connections, and tool calls through admin API", async () => {
    const authService = createAuthService();
    const registered = authService.register({
      email: "first_account",
      name: "First",
      password: "password-1"
    });
    const adminServer = await createFakeMcpAdminServer();
    const connection: McpConnection = {
      callTool: async (toolName, args) => ({ args, toolName }),
      listTools: async () => [
        {
          description: "Read a file",
          inputSchema: { type: "object" },
          name: "read_file",
          risk: "read"
        }
      ]
    };
    const policyStore = new InMemoryMcpSecurityPolicyStore({
      initial: {
        allowedServerNames: ["local"],
        allowedStdioCommands: ["node"]
      }
    });
    const securityPolicyProvider = new McpSecurityPolicyProvider(policyStore);
    const manager = new McpManager(new InMemoryMcpServerStore({ idFactory: () => "mcp-1" }), {
      connector: { connect: async () => connection },
      securityPolicyProvider
    });
    const server = buildServer({
      authService,
      logger: false,
      mcp: {
        manager,
        securityPolicyProvider,
        securityPolicyStore: policyStore
      },
      requireAuth: true
    });
    const headers = { authorization: `Bearer ${registered.token}` };

    const blocked = await server.inject({
      method: "GET",
      url: "/api/mcp/servers"
    });
    const policy = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/security"
    });
    const invalidSecurityPolicy = await server.inject({
      headers,
      method: "PUT",
      payload: {
        allowedServerNames: ["local"],
        maxToolOutputLength: 100
      },
      url: "/api/mcp/security"
    });
    const created = await server.inject({
      headers,
      method: "POST",
      payload: {
        autoConnect: true,
        config: {
          adminToken: "admin-token-value",
          adminUrl: adminServer.url,
          command: "node",
          apiToken: "redacted-test-value"
        },
        name: "local",
        transportType: "stdio"
      },
      url: "/api/mcp/servers"
    });
    const detail = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local"
    });
    const tools = await server.inject({
      headers,
      method: "GET",
      url: "/mcp/servers/local/tools"
    });
    const health = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/health"
    });
    const preflight = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/preflight"
    });
    const accessPolicy = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/access-policy"
    });
    const accessPolicyUpdate = await server.inject({
      headers,
      method: "PUT",
      payload: {
        allowedJiraProjectKeys: ["ENG"],
        allowPreviewReads: true
      },
      url: "/api/mcp/servers/local/access-policy"
    });
    const accessPolicyEmergency = await server.inject({
      headers,
      method: "POST",
      url: "/api/mcp/servers/local/access-policy/emergency-deny-all"
    });
    const blockedSwaggerSources = await server.inject({
      method: "GET",
      url: "/api/mcp/servers/local/swagger/sources"
    });
    const invalidSwaggerSource = await server.inject({
      headers,
      method: "POST",
      payload: { name: "orders" },
      url: "/api/mcp/servers/local/swagger/sources"
    });
    const swaggerSource = await server.inject({
      headers,
      method: "POST",
      payload: {
        name: "orders",
        url: "https://api.example.invalid/openapi.json"
      },
      url: "/api/mcp/servers/local/swagger/sources"
    });
    const swaggerSources = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/swagger/sources"
    });
    const swaggerSourceDetail = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/swagger/sources/orders"
    });
    const swaggerSync = await server.inject({
      headers,
      method: "POST",
      url: "/api/mcp/servers/local/swagger/sources/orders/sync"
    });
    const swaggerRevisions = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/swagger/sources/orders/revisions?limit=1"
    });
    const swaggerDiff = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/swagger/sources/orders/diff?from=rev-1&to=rev-2"
    });
    const swaggerPublish = await server.inject({
      headers,
      method: "POST",
      payload: {
        revisionId: "rev-2"
      },
      url: "/api/mcp/servers/local/swagger/sources/orders/publish"
    });
    const invalidSwaggerPublish = await server.inject({
      headers,
      method: "POST",
      payload: {},
      url: "/api/mcp/servers/local/swagger/sources/orders/publish"
    });
    const reconnected = await server.inject({
      headers,
      method: "POST",
      url: "/api/mcp/servers/local/reconnect"
    });
    const toolCall = await server.inject({
      headers,
      method: "POST",
      payload: {
        args: { path: "docs/input.md" }
      },
      url: "/api/mcp/servers/local/tools/read_file/call"
    });
    const updated = await server.inject({
      headers,
      method: "PATCH",
      payload: {
        autoConnect: false,
        description: "Local tool server"
      },
      url: "/api/mcp/servers/local"
    });
    const disconnected = await server.inject({
      headers,
      method: "POST",
      url: "/admin/mcp/servers/local/disconnect"
    });
    const deleted = await server.inject({
      headers,
      method: "DELETE",
      url: "/api/mcp/servers/local"
    });
    const afterDelete = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local"
    });
    await adminServer.close();

    expect(blocked.statusCode).toBe(401);
    expect(policy.json()).toMatchObject({
      configDefault: { allowedServerNames: [] },
      effective: { allowedServerNames: ["local"] },
      stored: { allowedServerNames: ["local"] }
    });
    expect(typeof policy.json().effective.createdAt).toBe("number");
    expect(invalidSecurityPolicy.statusCode).toBe(400);
    expect(invalidSecurityPolicy.json()).toMatchObject({
      code: "INVALID_MCP_SECURITY_POLICY",
      message: "maxToolOutputLength must be between 1024 and 500000"
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: "local",
      status: "CONNECTED",
      toolCount: 1,
      transportType: "STDIO"
    });
    expect(created.json()).not.toHaveProperty("config");
    expect(created.json()).not.toHaveProperty("tools");
    expect(detail.json()).toMatchObject({
      config: { apiToken: "[redacted]", command: "node" },
      name: "local",
      status: "CONNECTED",
      tools: ["read_file"],
      transportType: "STDIO"
    });
    expect(typeof created.json().createdAt).toBe("number");
    expect(tools.json()).toEqual([
      {
        description: "Read a file",
        inputSchema: { type: "object" },
        name: "read_file",
        risk: "read"
      }
    ]);
    expect(health.json()).toMatchObject({ status: "healthy", toolCount: 1 });
    expect(preflight.json()).toMatchObject({
      ok: true,
      readyForProduction: true,
      summary: { failCount: 0, passCount: 1, warnCount: 0 }
    });
    expect(accessPolicy.json()).toMatchObject({ allowedJiraProjectKeys: [], allowPreviewReads: null });
    expect(accessPolicyUpdate.json()).toMatchObject({
      allowedJiraProjectKeys: ["ENG"],
      allowPreviewReads: true
    });
    expect(accessPolicyEmergency.json()).toMatchObject({
      allowPreviewReads: false,
      publishedOnly: true
    });
    expect(blockedSwaggerSources.statusCode).toBe(401);
    expect(invalidSwaggerSource.statusCode).toBe(400);
    expect(invalidSwaggerSource.json()).toMatchObject({
      error: "Body must include name and url",
      timestamp: expect.any(String)
    });
    expect(invalidSwaggerSource.json()).not.toHaveProperty("code");
    expect(swaggerSource.statusCode).toBe(201);
    expect(swaggerSource.json()).toMatchObject({ name: "orders" });
    expect(swaggerSources.json()).toMatchObject([{ name: "orders" }]);
    expect(swaggerSourceDetail.json()).toMatchObject({ name: "orders" });
    expect(swaggerSync.json()).toMatchObject({ name: "orders", status: "synced" });
    expect(swaggerRevisions.json()).toMatchObject([{ id: "rev-2", sourceName: "orders" }]);
    expect(swaggerDiff.json()).toEqual({ changes: [{ from: "rev-1", to: "rev-2", type: "updated" }] });
    expect(swaggerPublish.json()).toMatchObject({ publishedRevisionId: "rev-2" });
    expect(invalidSwaggerPublish.statusCode).toBe(400);
    expect(invalidSwaggerPublish.json()).toMatchObject({
      error: "Body must include revisionId",
      timestamp: expect.any(String)
    });
    expect(invalidSwaggerPublish.json()).not.toHaveProperty("code");
    expect(reconnected.json()).toMatchObject({ health: { status: "healthy" }, status: "CONNECTED" });
    expect(toolCall.json()).toMatchObject({
      output: expect.stringContaining("--- BEGIN TOOL DATA (local.read_file) ---"),
      sanitized: {
        content: expect.stringContaining("toolName")
      }
    });
    expect(updated.json()).toMatchObject({ autoConnect: false, description: "Local tool server" });
    expect(disconnected.json()).toEqual({ status: "DISCONNECTED" });
    expect(deleted.statusCode).toBe(204);
    expect(afterDelete.statusCode).toBe(404);
  });

  it("runs MCP stdio registration, health, tools, sanitized calls, and policy denial through the API", async () => {
    const authService = createAuthService();
    const registered = authService.register({
      email: "first_account",
      name: "First",
      password: "password-1"
    });
    const policyStore = new InMemoryMcpSecurityPolicyStore({
      initial: {
        allowedServerNames: ["fixture", "remote-private"],
        allowedStdioCommands: ["node"]
      }
    });
    const securityPolicyProvider = new McpSecurityPolicyProvider(policyStore);
    const manager = new McpManager(new InMemoryMcpServerStore({ idFactory: () => "mcp-live-1" }), {
      connector: new DefaultMcpTransportConnector({
        requestTimeoutMs: 5_000,
        stderr: "pipe"
      }),
      securityPolicyProvider
    });
    const server = buildServer({
      authService,
      logger: false,
      mcp: {
        manager,
        securityPolicyProvider,
        securityPolicyStore: policyStore
      },
      requireAuth: true
    });
    const headers = { authorization: `Bearer ${registered.token}` };

    const deniedName = await server.inject({
      headers,
      method: "POST",
      payload: {
        autoConnect: false,
        config: { command: "node" },
        name: "not-allowed",
        transportType: "stdio"
      },
      url: "/api/mcp/servers"
    });
    const deniedPrivateRemote = await server.inject({
      headers,
      method: "POST",
      payload: {
        autoConnect: false,
        config: { url: "http://127.0.0.1:65535/mcp" },
        name: "remote-private",
        transportType: "streamable"
      },
      url: "/api/mcp/servers"
    });
    // Run the fixture server from a temp .mjs FILE, not `node -e <inline code>`: the supply-chain
    // audit (server-audit.ts) deliberately refuses an interpreter inline-code flag, which is exactly
    // the launch shape a real malicious MCP server would use. The file lives INSIDE packages/mcp (the
    // spawn cwd) so its bare `@modelcontextprotocol/sdk` imports resolve against the workspace
    // node_modules — a tmpdir has none.
    const { writeFile, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const fixturePath = join(process.cwd(), "..", "..", "packages", "mcp", `mcp-fixture-${process.pid.toString()}.mjs`);
    await writeFile(fixturePath, createMcpFixtureServerCode(), "utf8");
    const created = await server.inject({
      headers,
      method: "POST",
      payload: {
        autoConnect: true,
        config: {
          args: [fixturePath],
          command: "node",
          cwd: "../../packages/mcp"
        },
        name: "fixture",
        transportType: "stdio"
      },
      url: "/api/mcp/servers"
    });
    const health = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/fixture/health"
    });
    const tools = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/fixture/tools"
    });
    const toolCall = await server.inject({
      headers,
      method: "POST",
      payload: {
        args: { topic: "migration" }
      },
      url: "/api/mcp/servers/fixture/tools/synthetic_lookup/call"
    });
    const disconnected = await server.inject({
      headers,
      method: "POST",
      url: "/api/mcp/servers/fixture/disconnect"
    });

    expect(deniedName.statusCode).toBe(403);
    expect(deniedName.json()).toMatchObject({ code: "MCP_SERVER_DENIED" });
    expect(deniedPrivateRemote.statusCode).toBe(403);
    expect(deniedPrivateRemote.json()).toMatchObject({ code: "MCP_SERVER_DENIED" });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: "fixture",
      status: "CONNECTED",
      toolCount: 1
    });
    expect(health.json()).toMatchObject({
      status: "healthy",
      toolCount: 1
    });
    expect(tools.json()).toEqual([
      {
        description: "Returns synthetic migration data",
        inputSchema: expect.any(Object),
        name: "synthetic_lookup",
        risk: "read"
      }
    ]);
    expect(toolCall.json()).toMatchObject({
      output: expect.stringContaining("--- BEGIN TOOL DATA (fixture.synthetic_lookup) ---"),
      sanitized: {
        findings: expect.arrayContaining([expect.objectContaining({ name: "role_override" })]),
        warnings: expect.arrayContaining([
          "Injection pattern detected in tool output: role_override"
        ])
      }
    });
    expect(toolCall.json().output).not.toContain("Ignore previous instructions");
    expect(toolCall.json().output).toContain("[SANITIZED]");
    expect(disconnected.json()).toEqual({ status: "DISCONNECTED" });
    await rm(fixturePath, { force: true });
  });

  it("returns local MCP preflight diagnostics when no remote admin endpoint is configured", async () => {
    const authService = createAuthService();
    const registered = authService.register({
      email: "first_account",
      name: "First",
      password: "password-1"
    });
    const policyStore = new InMemoryMcpSecurityPolicyStore({
      initial: {
        allowedServerNames: ["local"],
        allowedStdioCommands: ["node"]
      }
    });
    const securityPolicyProvider = new McpSecurityPolicyProvider(policyStore);
    const manager = new McpManager(new InMemoryMcpServerStore({ idFactory: () => "mcp-1" }), {
      securityPolicyProvider
    });
    const server = buildServer({
      authService,
      logger: false,
      mcp: {
        manager,
        securityPolicyProvider,
        securityPolicyStore: policyStore
      },
      requireAuth: true
    });
    const headers = { authorization: `Bearer ${registered.token}` };

    await server.inject({
      headers,
      method: "POST",
      payload: {
        autoConnect: false,
        config: { command: "node" },
        name: "local",
        transportType: "stdio"
      },
      url: "/api/mcp/servers"
    });
    const preflight = await server.inject({
      headers,
      method: "GET",
      url: "/api/mcp/servers/local/preflight"
    });

    expect(preflight.statusCode).toBe(200);
    expect(preflight.json()).toMatchObject({
      ok: true,
      readyForProduction: false,
      serverName: "local",
      summary: { failCount: 0, warnCount: 2 }
    });
  });
});
