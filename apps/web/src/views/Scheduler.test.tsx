import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SchedulerView } from "./Scheduler.js";
import { createApiClient } from "../api/client.js";
import { I18nProvider } from "../i18n/index.js";

// Renders the REAL view statically (no query resolution under
// renderToStaticMarkup, so the list sits in its loading state) — a smoke
// test against production markup that the create-form and its cadence
// dropdown render without crashing, and that the dropdown carries every
// cadence kind the S9 audit brief calls for.
function renderView(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = createApiClient("http://127.0.0.1:3030", "");
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <SchedulerView client={client} />
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe("SchedulerView — non-dev create form (no cron syntax)", () => {
  it("renders the page title and the prompt textarea", () => {
    const html = renderView();
    expect(html).toContain("Scheduler");
    expect(html).toMatch(/<textarea\b[^>]*placeholder="Summarize today&#x27;s calendar and open tasks"/);
  });

  it("the cadence dropdown offers daily / weekdays / weekly / interval / custom, no raw cron field", () => {
    const html = renderView();
    expect(html).toContain("Daily at a time");
    expect(html).toContain("Weekdays at a time");
    expect(html).toContain("Weekly on a day");
    expect(html).toContain("Every N minutes");
    expect(html).toContain("Custom (advanced)");
    expect(html).not.toMatch(/name="cronExpression"/);
  });

  it("defaults to the daily kind with a time input (no cron syntax visible)", () => {
    const html = renderView();
    expect(html).toMatch(/<input\b[^>]*type="time"/);
  });

  it("create is disabled while the prompt is empty (initial state)", () => {
    const html = renderView();
    expect(html).toMatch(/<button\b[^>]*disabled=""[^>]*>[\s\S]*?Add/);
  });
});
