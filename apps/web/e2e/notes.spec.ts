import { expect, test } from "@playwright/test";

const ok = (json: unknown) => ({ contentType: "application/json", json });

test("notes view creates and deletes notes", async ({ page }) => {
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
  await page.route("**/api/notes/list", (route) =>
    route.fulfill(ok({ dir: ".", entries: [{ isDirectory: false, name: "todo.md", sizeBytes: 120 }], truncated: false }))
  );

  let savedBody: unknown = null;
  await page.route("**/api/notes/save", async (route) => {
    savedBody = route.request().postDataJSON();
    await route.fulfill(ok({ path: "idea.md" }));
  });
  let deletedUrl = "";
  await page.route("**/api/notes?path=**", async (route) => {
    deletedUrl = route.request().url();
    await route.fulfill(ok({ ok: true }));
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Notes" }).click();

  // Create a note.
  await page.getByRole("button", { name: "New note" }).click();
  await page.getByPlaceholder("note-name.md").fill("idea.md");
  await page.getByPlaceholder("Write in Markdown…").fill("# Idea\n\nShip it.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => savedBody).toMatchObject({ content: "# Idea\n\nShip it.", overwrite: true, path: "idea.md" });

  // Delete the existing note.
  await page.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => deletedUrl).toContain("path=todo.md");
});
