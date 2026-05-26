import { expect, test } from "@playwright/test";

const ok = (json: unknown) => ({ contentType: "application/json", json });

test("renders a live proactive notice as a toast", async ({ page }) => {
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

  // One-shot SSE body: open frame, then a notice frame.
  await page.route("**/api/agent-notices/stream**", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body:
        'event: open\ndata: {"userId":"me"}\n\n' +
        'event: notice\ndata: {"message":"Your 3pm meeting starts in 10 minutes."}\n\n'
    })
  );

  await page.goto("/");

  await expect(page.getByRole("status").filter({ hasText: "Your 3pm meeting starts in 10 minutes." })).toBeVisible();
});
