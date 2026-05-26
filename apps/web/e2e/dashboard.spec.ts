import { expect, test } from "@playwright/test";

const ok = (json: unknown) => ({ contentType: "application/json", json });

test("dashboard renders token cost, tool accuracy, and latency", async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem("muse.lang")) {
      window.localStorage.setItem("muse.lang", "en");
    }
    window.localStorage.setItem("muse.apiUrl", "http://127.0.0.1:3030");
  });
  await page.route("**/api/health", (route) => route.fulfill(ok({ status: "ok" })));
  await page.route("**/api/today", (route) =>
    route.fulfill(ok({ events: [], generatedAt: new Date().toISOString(), lookaheadHours: 24, reminders: [], tasks: [] }))
  );
  await page.route("**/api/tasks**", (route) => route.fulfill(ok({ status: "open", tasks: [], total: 0 })));
  await page.route("**/api/proactive/history**", (route) => route.fulfill(ok({ entries: [] })));
  await page.route("**/api/agent-notices/stream**", (route) => route.fulfill({ body: "event: open\ndata: {}\n\n", contentType: "text/event-stream" }));

  await page.route("**/api/admin/token-cost/daily**", (route) =>
    route.fulfill(ok([
      { day: "2026-05-20", totalCostUsd: 0.01, totalTokens: 1000 },
      { day: "2026-05-21", totalCostUsd: 0.02, totalTokens: 2000 }
    ]))
  );
  await page.route("**/api/admin/tools/stats**", (route) =>
    route.fulfill(ok({ accuracy: 0.9, byOutcome: { error: 1, ok: 9 }, byTool: [{ count: 5, outcome: "ok", server: "core", tool: "time_now" }], total: 10 }))
  );
  await page.route("**/api/admin/metrics/latency/summary**", (route) =>
    route.fulfill(ok({ count: 10, p50Ms: 120, p95Ms: 400, p99Ms: 800 }))
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Dashboard" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("3,000")).toBeVisible();
  await expect(page.getByText("90%")).toBeVisible();
  await expect(page.getByText("time_now")).toBeVisible();
  await expect(page.getByText("400 ms")).toBeVisible();
});
