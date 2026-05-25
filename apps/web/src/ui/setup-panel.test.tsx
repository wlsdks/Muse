import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SetupPanel } from "./setup-panel.js";
import type { ApiClient } from "./api-client.js";

const fakeClient = {
  delete: async () => { throw new Error("unused"); },
  get: async () => { throw new Error("unused"); },
  post: async () => { throw new Error("unused"); },
  put: async () => { throw new Error("unused"); }
} as unknown as ApiClient;

function render(seed?: { enabled?: string; maxUses?: string }): string {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  if (seed?.enabled !== undefined) {
    client.setQueryData(["setting-webSearch.enabled"], { key: "webSearch.enabled", value: seed.enabled });
  }
  if (seed?.maxUses !== undefined) {
    client.setQueryData(["setting-webSearch.maxUses"], { key: "webSearch.maxUses", value: seed.maxUses });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SetupPanel client={fakeClient} />
    </QueryClientProvider>
  );
}

// The user's requirement: every backend-honored setting has a real web
// control. The backend reads BOTH webSearch.enabled and webSearch.maxUses
// (server-helpers.ts applyWebSearchPolicy); maxUses had no UI control until
// now. These pin that the control exists and reflects the persisted value.
describe("SetupPanel — web-search settings controls", () => {
  it("renders both the enabled toggle and the maxUses number input", () => {
    const html = render({ enabled: "true", maxUses: "5" });
    expect(html).toContain("Web search");
    expect(html).toContain("Max uses");
    expect(html).toContain('type="number"');
  });

  it("reflects the persisted maxUses value", () => {
    expect(render({ enabled: "true", maxUses: "9" })).toContain('value="9"');
  });

  it("defaults maxUses to 5 when the setting is absent", () => {
    expect(render({ enabled: "true" })).toContain('value="5"');
  });

  it("disables the maxUses input when web search is off", () => {
    const html = render({ enabled: "false", maxUses: "5" });
    expect(html).toContain("disabled");
  });
});
