import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MuseConsole } from "./App.js";

describe("MuseConsole", () => {
  it("renders the operator workspace without API data", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { enabled: false, retry: false }
      }
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MuseConsole />
      </QueryClientProvider>
    );

    expect(html).toContain("Muse");
    expect(html).toContain("Ask Muse");
    expect(html).toContain("Approvals");
  });
});

