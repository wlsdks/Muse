import { describe, expect, it } from "vitest";
import {
  DynamicScheduler,
  InMemoryScheduledJobExecutionStore,
  InMemoryScheduledJobStore,
  ScheduledJobDispatcher,
  ScheduledMcpToolInvoker
} from "@muse/scheduler";
import { buildServer } from "../src/server.js";
import { createAuthService } from "./helpers/test-auth.js";

function createUnusedMcpInvoker(): ScheduledMcpToolInvoker {
  return new ScheduledMcpToolInvoker({
    connect: async () => false,
    getStatus: () => "disconnected",
    toMuseTools: () => []
  } as never);
}

function buildTestServer() {
  const authService = createAuthService();
  const registered = authService.register({ email: "cadence_web", name: "Cadence", password: "password-1" });
  const schedulerStore = new InMemoryScheduledJobStore({ idFactory: () => "job-cadence" });
  const schedulerExecutionStore = new InMemoryScheduledJobExecutionStore({ idFactory: () => "exec-cadence" });
  const schedulerService = new DynamicScheduler({
    dispatcher: new ScheduledJobDispatcher({
      agentExecutor: { execute: async (job) => `executed:${job.agentPrompt}` },
      mcpInvoker: createUnusedMcpInvoker()
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
  return { headers: { authorization: `Bearer ${registered.token}` }, server };
}

describe("api server: scheduler cadence shorthand (web scheduler form, no cron syntax)", () => {
  it("creates an agent job from {prompt, cadence}, resolving cron through the SAME parseCadence the CLI uses and echoing a structured cadenceSummary", async () => {
    const { headers, server } = buildTestServer();

    const created = await server.inject({
      headers,
      method: "POST",
      payload: { cadence: "매일 09:00", prompt: "Summarize today's calendar" },
      url: "/api/scheduler/jobs"
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      agentPrompt: "Summarize today's calendar",
      cadenceSummary: { hour: 9, kind: "daily", minute: 0 },
      cronExpression: "0 9 * * *",
      jobType: "AGENT",
      name: "Summarize today's calendar"
    });
  });

  it("derives a truncated job name from a long prompt when no name is given", async () => {
    const { headers, server } = buildTestServer();
    const longPrompt = "a".repeat(120);

    const created = await server.inject({
      headers,
      method: "POST",
      payload: { cadence: "hourly", prompt: longPrompt },
      url: "/api/scheduler/jobs"
    });

    expect(created.statusCode).toBe(201);
    const body = created.json() as { name: string };
    expect(body.name.length).toBe(60);
    expect(body.name.endsWith("…")).toBe(true);
  });

  it("rejects an unrecognized cadence with parseCadence's OWN accepted-forms message verbatim, not a generic 'Invalid request'", async () => {
    const { headers, server } = buildTestServer();

    const created = await server.inject({
      headers,
      method: "POST",
      payload: { cadence: "whenever I feel like it", prompt: "Summarize today's calendar" },
      url: "/api/scheduler/jobs"
    });

    expect(created.statusCode).toBe(400);
    const body = created.json() as { error: string };
    expect(body.error).toContain("Unrecognized cadence");
    expect(body.error).toContain("Accepted forms");
  });

  it("rejects an empty prompt with the standard missing-fields error (no job created)", async () => {
    const { headers, server } = buildTestServer();

    const created = await server.inject({
      headers,
      method: "POST",
      payload: { cadence: "매일 09:00", prompt: "" },
      url: "/api/scheduler/jobs"
    });

    expect(created.statusCode).toBe(400);

    const listed = await server.inject({ headers, method: "GET", url: "/api/scheduler/jobs" });
    expect(listed.json()).toMatchObject({ total: 0 });
  });

  it("an explicit name still wins over the derived-from-prompt name", async () => {
    const { headers, server } = buildTestServer();

    const created = await server.inject({
      headers,
      method: "POST",
      payload: { cadence: "평일 9시", name: "Weekday standup digest", prompt: "Draft the standup notes" },
      url: "/api/scheduler/jobs"
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      cadenceSummary: { hour: 9, kind: "weekdays", minute: 0 },
      name: "Weekday standup digest"
    });
  });

  it("summarizes a legacy raw-cron job (created without cadence) as kind:'custom' in the list response", async () => {
    const { headers, server } = buildTestServer();

    await server.inject({
      headers,
      method: "POST",
      payload: { agentPrompt: "Run", cronExpression: "*/7 3 1 * *", jobType: "agent", name: "Legacy cron job" },
      url: "/api/scheduler/jobs"
    });

    const listed = await server.inject({ headers, method: "GET", url: "/api/scheduler/jobs" });
    expect(listed.json()).toMatchObject({
      items: [{ cadenceSummary: { cronExpression: "*/7 3 1 * *", kind: "custom" }, name: "Legacy cron job" }]
    });
  });
});
