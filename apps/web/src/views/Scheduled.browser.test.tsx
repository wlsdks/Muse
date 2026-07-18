import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";

import "../theme.css";

import { ScheduleTable } from "./Scheduled.js";
import { consumeBuilderFocusHint } from "./scheduled-logic.js";
import { I18nProvider } from "../i18n/index.js";

import type { ApiClient } from "../api/client.js";
import type { FlowsResponse, SchedulerJobsResponse } from "../api/types.js";

afterEach(() => {
  cleanup();
  window.sessionStorage.removeItem("muse.builderFocusFlow");
});

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
        { id: "job_1::action", kind: "action.agent", label: "action.agent", meta: { prompt: "오늘 일정 요약" } },
        { id: "job_1::output", kind: "output.record", label: "output.record", meta: {} }
      ],
      source: "scheduler"
    }
  ]
};
const JOBS: SchedulerJobsResponse = {
  items: [
    {
      agentPrompt: "오늘 일정 요약",
      cadenceSummary: { hour: 9, kind: "daily", minute: 0 },
      createdAt: 1,
      cronExpression: "0 9 * * *",
      enabled: true,
      id: "job_1",
      lastRunAt: null,
      lastStatus: null,
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
    patch: vi.fn(async () => ({})) as unknown as ApiClient["patch"],
    post: vi.fn(async () => ({})) as unknown as ApiClient["post"],
    put: vi.fn()
  };
}

async function renderTable(client: ApiClient, onNavigate?: (view: string) => void) {
  window.localStorage.setItem("muse.lang", "en");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ScheduleTable client={client} onNavigate={onNavigate} />
      </I18nProvider>
    </QueryClientProvider>
  );
  await expect.element(screen.getByText("Morning brief")).toBeVisible();
  return screen;
}

test("Turn off PATCHes {enabled:false} for the row's job", async () => {
  const client = fakeClient();
  const screen = await renderTable(client);

  await screen.getByRole("button", { name: "Turn off" }).click();

  expect(client.patch).toHaveBeenCalledWith("/api/scheduler/jobs/job_1", { enabled: false });
});

test("Run now POSTs the row's trigger endpoint", async () => {
  const client = fakeClient();
  const screen = await renderTable(client);

  await screen.getByRole("button", { name: "Run now" }).click();

  expect(client.post).toHaveBeenCalledWith("/api/scheduler/jobs/job_1/trigger");
});

test("Open in Builder writes the one-shot focus hint and navigates to flows", async () => {
  const client = fakeClient();
  const navigate = vi.fn();
  const screen = await renderTable(client, navigate);

  await screen.getByRole("button", { name: "Open in Builder" }).click();

  expect(navigate).toHaveBeenCalledWith("flows");
  // The hint is exactly the one the Builder consumes — and it's one-shot.
  expect(consumeBuilderFocusHint(window.sessionStorage)).toBe("job_1");
  expect(consumeBuilderFocusHint(window.sessionStorage)).toBeUndefined();
});

test("Run now stays available on a PAUSED row — the scheduler honors a manual trigger regardless of enabled", async () => {
  const client = fakeClient();
  (client.get as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
    if (path === "/api/flows") {
      return { flows: [{ ...FLOWS.flows[0]!, enabled: false, nextRunAtIso: null }] };
    }
    if (path.startsWith("/api/scheduler/jobs")) return JOBS;
    throw new Error(`unexpected GET ${path}`);
  });
  const screen = await renderTable(client);

  await screen.getByRole("button", { name: "Run now" }).click();

  expect(client.post).toHaveBeenCalledWith("/api/scheduler/jobs/job_1/trigger");
});
