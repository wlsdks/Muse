import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ScheduleTable } from "./Scheduled.js";
import { I18nProvider } from "../i18n/index.js";
import { DICTIONARIES } from "../i18n/strings.js";

import type { ApiClient } from "../api/client.js";
import type { FlowsResponse, SchedulerJobsResponse } from "../api/types.js";

const FLOWS: FlowsResponse = {
  flows: [
    {
      edges: [],
      enabled: true,
      id: "job_1",
      name: "Morning brief",
      nextRunAtIso: "2026-07-19T00:00:00.000Z",
      nodes: [
        { id: "job_1::trigger", kind: "trigger.schedule", label: "trigger.schedule", meta: { cronExpression: "0 9 * * *" } },
        { id: "job_1::action", kind: "action.agent", label: "action.agent", meta: { prompt: "오늘 일정 요약해서 보내줘" } },
        { id: "job_1::output", kind: "output.record", label: "output.record", meta: {} }
      ],
      source: "scheduler"
    },
    {
      edges: [],
      enabled: false,
      id: "job_2",
      name: "Paused tool",
      nextRunAtIso: null,
      nodes: [
        { id: "job_2::trigger", kind: "trigger.schedule", label: "trigger.schedule", meta: {} },
        { id: "job_2::action", kind: "action.tool", label: "action.tool", meta: { server: "muse.time", tool: "now" } },
        { id: "job_2::output", kind: "output.record", label: "output.record", meta: {} }
      ],
      source: "scheduler"
    }
  ]
};

const JOBS: SchedulerJobsResponse = {
  items: [
    {
      agentPrompt: "오늘 일정 요약해서 보내줘",
      cadenceSummary: { hour: 9, kind: "daily", minute: 0 },
      createdAt: 1,
      cronExpression: "0 9 * * *",
      enabled: true,
      id: "job_1",
      lastRunAt: 1_752_800_000_000,
      lastStatus: "SUCCESS",
      name: "Morning brief"
    }
  ],
  limit: 100,
  offset: 0,
  total: 1
};

function fakeClient(): ApiClient {
  return {
    baseUrl: "http://fake.invalid",
    del: vi.fn(),
    get: vi.fn(async (path: string) => {
      if (path === "/api/flows") return FLOWS;
      if (path.startsWith("/api/scheduler/jobs")) return JOBS;
      throw new Error(`unexpected GET ${path}`);
    }) as unknown as ApiClient["get"],
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  };
}

async function renderTable(): Promise<string> {
  const client = fakeClient();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await qc.prefetchQuery({ queryFn: () => client.get("/api/flows"), queryKey: ["flows", client.baseUrl] });
  await qc.prefetchQuery({
    queryFn: () => client.get("/api/scheduler/jobs?limit=100"),
    queryKey: ["scheduler-jobs", client.baseUrl]
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ScheduleTable client={client} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe("ScheduleTable — the builder-grade operational rows", () => {
  it("renders one row per flow with WHAT it does (agent prompt head / server.tool)", async () => {
    const html = await renderTable();
    expect(html).toContain("Morning brief");
    expect(html).toContain("오늘 일정 요약해서 보내줘");
    expect(html).toContain("Paused tool");
    expect(html).toContain("muse.time.now");
  });

  it("shows the active/paused summary, the cadence, the last-run badge, and Never-ran for a job without stats", async () => {
    const html = await renderTable();
    expect(html).toContain("1"); // active count in summary
    expect(html).toContain(DICTIONARIES.en["scheduled.table.what"]);
    expect(html).toContain("SUCCESS");
    expect(html).toContain(DICTIONARIES.en["scheduled.never"]);
    expect(html).toContain(DICTIONARIES.en["auto.flows.paused"]);
  });

  it("row controls carry the on/off, run-now and open-in-Builder affordances", async () => {
    const html = await renderTable();
    expect(html).toContain(DICTIONARIES.en["scheduled.turnOff"]); // enabled row
    expect(html).toContain(DICTIONARIES.en["scheduled.turnOn"]); // paused row
    expect(html).toContain(DICTIONARIES.en["scheduled.runNow"]);
    expect(html).toContain(DICTIONARIES.en["scheduled.openInBuilder"]);
  });
});
