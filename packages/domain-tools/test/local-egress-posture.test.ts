import { describe, expect, it } from "vitest";

import {
  createFetchMcpServer,
  createSearchMcpServer,
  createWebReadMcpServer,
  fetchReadableUrl,
  type HostLookup
} from "../src/index.js";

const LOCAL_EGRESS_BLOCKED = "LOCAL_EGRESS_BLOCKED";

function firstTool<T extends { readonly tools: readonly { readonly execute: (args: Record<string, unknown>) => Promise<unknown> }[] }>(server: T) {
  return server.tools[0]!;
}

describe("local-only interactive-web posture", () => {
  it("returns LOCAL_EGRESS_BLOCKED before URL parsing, lookup, fetch, retry, extraction, or fallback for every direct web primitive", async () => {
    let fetchCalls = 0;
    let lookupCalls = 0;
    let retrySleeps = 0;
    let extractorCalls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("<title>should not be read</title>", { status: 200, headers: { "content-type": "text/html" } });
    };
    const lookup: HostLookup = async () => {
      lookupCalls += 1;
      return [{ address: "93.184.216.34", family: 4 }];
    };
    const retryOptions = { baseDelayMs: 0, retries: 0, sleep: async () => { retrySleeps += 1; } };

    await expect(fetchReadableUrl("not even a URL", {
      fetchImpl: fetch,
      interactiveWebEgressAllowed: false,
      lookup,
      pdfExtractor: async () => { extractorCalls += 1; return "must not run"; },
      retryOptions
    } as never)).resolves.toEqual({ error: LOCAL_EGRESS_BLOCKED, ok: false });

    const webRead = createWebReadMcpServer({
      extractPdfText: async () => { extractorCalls += 1; return "must not run"; },
      fetch,
      interactiveWebEgressAllowed: false,
      lookup,
      retryOptions
    } as never);
    await expect(firstTool(webRead).execute({ url: "not even a URL" })).resolves.toEqual({ error: LOCAL_EGRESS_BLOCKED });

    const search = createSearchMcpServer({
      fetch,
      interactiveWebEgressAllowed: false,
      retryOptions,
      searxngUrl: "https://search.example.test"
    } as never);
    await expect(firstTool(search).execute({ query: "latest news" })).resolves.toEqual({ error: LOCAL_EGRESS_BLOCKED });

    const fetchServer = createFetchMcpServer({
      allowedHosts: ["example.test"],
      fetch,
      interactiveWebEgressAllowed: false,
      retryOptions
    } as never);
    await expect(firstTool(fetchServer).execute({ url: "not even a URL" })).resolves.toEqual({ error: LOCAL_EGRESS_BLOCKED });

    expect({ extractorCalls, fetchCalls, lookupCalls, retrySleeps }).toEqual({
      extractorCalls: 0,
      fetchCalls: 0,
      lookupCalls: 0,
      retrySleeps: 0
    });
  });

  it("keeps the existing direct readable-page contract when interactive web is explicitly allowed", async () => {
    const lookup: HostLookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const result = await fetchReadableUrl("https://example.test/report", {
      fetchImpl: async () => new Response("<title>Report</title><p>Readable body</p>", { status: 200, headers: { "content-type": "text/html" } }),
      interactiveWebEgressAllowed: true,
      lookup
    } as never);

    expect(result).toMatchObject({ ok: true, title: "Report" });
  });
});
