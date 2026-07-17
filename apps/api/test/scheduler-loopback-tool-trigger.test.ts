import { describe, expect, it } from "vitest";
import {
  DynamicScheduler,
  InMemoryScheduledJobExecutionStore,
  InMemoryScheduledJobStore,
  ScheduledJobDispatcher,
  ScheduledMcpToolInvoker
} from "@muse/scheduler";
import { InMemoryMcpServerStore, McpManager } from "@muse/mcp";
import type { MuseTool } from "@muse/tools";
import { buildServer } from "../src/server.js";
import { createAuthService } from "./helpers/test-auth.js";

/**
 * Proves the Builder's "도구 실행" (mcp_tool) flow actually EXECUTES a
 * built-in loopback tool end to end through the real HTTP surface —
 * create -> trigger -> execution record — using the SAME `extraTools`
 * injection seam `packages/autoconfigure` wires in production
 * (`ScheduledMcpToolInvoker(mcpManager, { extraTools: () => loopbackTools })`).
 * No `@muse/mcp` server is ever registered/connected here — the fake
 * `muse.time.now` tool resolves ONLY through `extraTools`, exactly mirroring
 * why the built-in loopback tools were previously unreachable from a
 * scheduled job (they were never McpManager connections).
 */
function fakeTimeNowTool(nowIso: string): MuseTool {
  return {
    definition: {
      description: "Returns the current ISO timestamp.",
      inputSchema: {},
      name: "muse.time.now",
      risk: "read"
    },
    execute: () => ({ iso: nowIso })
  };
}

function neverConnectingMcpManager(): McpManager {
  return new McpManager(new InMemoryMcpServerStore(), {
    connector: { connect: async () => ({ listTools: async () => [] }) }
  });
}

describe("api server: scheduled mcp_tool job against a built-in loopback tool (extraTools seam)", () => {
  it("creates a muse.time.now flow, triggers it, and records a SUCCESS execution with the real tool result", async () => {
    const authService = createAuthService();
    const registered = authService.register({
      email: "loopback_tool_account",
      name: "Loopback",
      password: "password-1"
    });

    const schedulerStore = new InMemoryScheduledJobStore({ idFactory: () => "job-1" });
    let executionIndex = 0;
    const schedulerExecutionStore = new InMemoryScheduledJobExecutionStore({
      idFactory: () => `exec-${++executionIndex}`
    });
    const schedulerService = new DynamicScheduler({
      dispatcher: new ScheduledJobDispatcher({
        agentExecutor: { execute: () => { throw new Error("not an agent job"); } },
        mcpInvoker: new ScheduledMcpToolInvoker(neverConnectingMcpManager(), {
          extraTools: () => [fakeTimeNowTool("2026-07-18T00:00:00.000Z")]
        })
      }),
      executionStore: schedulerExecutionStore,
      store: schedulerStore
    });
    const server = buildServer({
      authService,
      logger: false,
      requireAuth: true,
      scheduler: {
        executionStore: schedulerExecutionStore,
        service: schedulerService,
        store: schedulerStore
      }
    });
    const headers = { authorization: `Bearer ${registered.token}` };

    // Exact POST /api/scheduler/jobs body the Builder's compile seam
    // (`flowDraftToJobInput`, jobType: "mcp_tool" branch) sends.
    const created = await server.inject({
      headers,
      method: "POST",
      payload: {
        cronExpression: "0 * * * *",
        enabled: true,
        jobType: "mcp_tool",
        maxRetryCount: 3,
        mcpServerName: "muse.time",
        name: "Time check",
        retryOnFailure: false,
        timezone: "UTC",
        toolArguments: {},
        toolName: "now"
      },
      url: "/api/scheduler/jobs"
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      id: "job-1",
      jobType: "MCP_TOOL",
      mcpServerName: "muse.time",
      toolName: "now"
    });

    const flows = await server.inject({ headers, method: "GET", url: "/api/flows" });
    expect(flows.json()).toMatchObject({
      flows: [
        {
          id: "job-1",
          nodes: [
            expect.anything(),
            { kind: "action.tool", meta: { server: "muse.time", tool: "now" } },
            expect.anything()
          ]
        }
      ]
    });

    const trigger = await server.inject({
      headers,
      method: "POST",
      url: "/api/scheduler/jobs/job-1/trigger"
    });
    expect(trigger.statusCode).toBe(200);
    expect(trigger.json()).toEqual({
      result: JSON.stringify({ iso: "2026-07-18T00:00:00.000Z" }, null, 2)
    });

    const executions = await server.inject({
      headers,
      method: "GET",
      url: "/api/scheduler/jobs/job-1/executions"
    });
    expect(executions.json()).toMatchObject({
      items: [
        {
          dryRun: false,
          jobId: "job-1",
          status: "SUCCESS"
        }
      ],
      total: 1
    });
    expect(executions.json().items[0].result).toContain("2026-07-18T00:00:00.000Z");
    expect(executions.json().items[0].failureReason).toBeNull();
  });
});
