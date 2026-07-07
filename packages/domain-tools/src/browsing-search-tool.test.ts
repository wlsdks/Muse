import { describe, expect, it } from "vitest";

import { createBrowsingSearchTool, type BrowsingVisitLike } from "./browsing-search-tool.js";

const ctx = { runId: "r", userId: "u" };

const visits: readonly BrowsingVisitLike[] = [
  { id: "1", title: "Rust ownership guide", url: "https://blog.example/rust", visitedAt: "2026-05-20T00:00:00Z" },
  { id: "2", title: "Pasta recipe", url: "https://food.example/pasta" },
  { id: "3", title: "unrelated", url: "https://x.example/RUST-in-url" }
];

describe("createBrowsingSearchTool", () => {
  it("declares the verb_noun name, read risk, required query", () => {
    const tool = createBrowsingSearchTool({ browsingVisits: () => [] });
    expect(tool.definition.name).toBe("browsing_search");
    expect(tool.definition.risk).toBe("read");
    expect(tool.definition.inputSchema.required).toEqual(["query"]);
  });

  it("matches title OR url, case-insensitive, and respects the default limit", async () => {
    const tool = createBrowsingSearchTool({ browsingVisits: () => visits });
    const result = await tool.execute({ query: "rust" }, ctx) as Record<string, unknown>;
    expect(result["count"]).toBe(2);
    expect((result["hits"] as { id: string }[]).map((h) => h.id)).toEqual(["1", "3"]);
  });

  it("clamps limit and echoes visitedAt when present", async () => {
    const tool = createBrowsingSearchTool({ browsingVisits: async () => visits });
    const result = await tool.execute({ query: "example", limit: 1 }, ctx) as Record<string, unknown>;
    expect(result["count"]).toBe(1);
    expect((result["hits"] as { visitedAt?: string }[])[0]!.visitedAt).toBe("2026-05-20T00:00:00Z");
  });

  it("returns a reason (no throw) for an empty query", async () => {
    const tool = createBrowsingSearchTool({ browsingVisits: () => visits });
    const result = await tool.execute({ query: "   " }, ctx) as Record<string, unknown>;
    expect(result["found"]).toBe(false);
    expect(result["count"]).toBe(0);
  });
});
