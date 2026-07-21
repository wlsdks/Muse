import { describe, expect, it } from "vitest";

import { createSearchMcpServer } from "../src/index.js";

const DDG_HTML =
  '<a rel="nofollow" class="result__a" href="https://example.com/a">Example A</a>' +
  '<a class="result__snippet">Snippet A</a>';

function ddgFetch(): typeof globalThis.fetch {
  return (async () => new Response(DDG_HTML, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof globalThis.fetch;
}

function searchTool(opts: Parameters<typeof createSearchMcpServer>[0] = {}) {
  const server = createSearchMcpServer(opts);
  return server.tools[0]!;
}

// A supplied but unrecognised time_range ('hour') used to be silently dropped —
// the result carried no time_range field at all, so an all-time search came back
// looking like it had honoured the time-scoped question. The applied window is
// now always echoed, and an unmapped value gets a self-correcting note.
describe("muse.search — time_range is always echoed, never silently dropped", () => {
  it("echoes the applied window on a recognised time_range, with no note", async () => {
    const tool = searchTool({ fetch: ddgFetch() });
    const out = (await tool.execute({ query: "hello", time_range: "day" })) as { time_range?: string | null; note?: string };
    expect(out.time_range).toBe("day");
    expect(out.note).toBeUndefined();
  });

  it("echoes time_range: null and adds a note when the supplied value doesn't map to a known window", async () => {
    const tool = searchTool({ fetch: ddgFetch() });
    const out = (await tool.execute({ query: "hello", time_range: "hour" })) as { time_range?: string | null; note?: string };
    expect(out.time_range).toBeNull();
    expect(out.note).toBeDefined();
    expect(out.note).toContain("hour");
    expect(out.note).toContain("day");
  });

  it("echoes time_range: null with no note when time_range was simply omitted", async () => {
    const tool = searchTool({ fetch: ddgFetch() });
    const out = (await tool.execute({ query: "hello" })) as { time_range?: string | null; note?: string };
    expect(out.time_range).toBeNull();
    expect(out.note).toBeUndefined();
  });
});
