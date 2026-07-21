import { describe, expect, it } from "vitest";

import { createFindItemsTool, findAcrossDomains, type FindSources } from "../src/find-items-tool.js";

const SOURCES: FindSources = {
  tasks: [
    { id: "t1", title: "book dentist appointment" },
    { id: "t2", title: "buy milk" }
  ],
  reminders: [{ id: "r1", text: "call the dentist back" }],
  contacts: [{ id: "c1", name: "Dr. Kim", relationship: "dentist" }],
  events: [{ id: "e1", title: "team sync" }]
};

describe("findAcrossDomains (moved into @muse/autoconfigure)", () => {
  it("matches the query across every structured store, case-insensitive", () => {
    const hits = findAcrossDomains(SOURCES, "DENTIST");
    expect(hits.map((h) => h.domain).sort()).toEqual(["contact", "reminder", "task"]);
  });

  it("a blank query matches nothing (not everything)", () => {
    expect(findAcrossDomains(SOURCES, "   ")).toEqual([]);
  });
});

describe("createFindItemsTool", () => {
  it("is a read-risk tool named find_items", () => {
    const tool = createFindItemsTool({ find: () => SOURCES });
    expect(tool.definition.name).toBe("find_items");
    expect(tool.definition.risk).toBe("read");
  });

  it("returns the cross-store union of items mentioning the term (the chain the 12B can't do)", async () => {
    const tool = createFindItemsTool({ find: () => SOURCES });
    const result = (await tool.execute({ query: "dentist" }, { runId: "t", userId: "u" })) as {
      hits: { domain: string; label: string }[];
      total: number;
    };
    expect(result.total).toBe(3); // the dentist task + reminder + contact — NOT the milk task or team sync
    expect(result.hits.map((h) => h.domain).sort()).toEqual(["contact", "reminder", "task"]);
    expect(result.hits.some((h) => h.domain === "task" && h.label.toLowerCase().includes("dentist"))).toBe(true);
  });

  it("a blank/whitespace query returns zero hits, never the whole store", async () => {
    const tool = createFindItemsTool({ find: () => SOURCES });
    const result = (await tool.execute({ query: "   " }, { runId: "t", userId: "u" })) as { total: number };
    expect(result.total).toBe(0);
  });

  it("a blank query names the missing parameter instead of returning a bare zero-hit result", async () => {
    // Byte-identical {hits:[],total:0} for "no query given" vs "genuine zero-hit search" let the
    // model report "nothing anywhere" after a call it never ran.
    const tool = createFindItemsTool({ find: () => SOURCES });
    const result = (await tool.execute({ query: "" }, { runId: "t", userId: "u" })) as {
      found: boolean;
      hits: unknown[];
      reason: string;
      total: number;
    };
    expect(result.found).toBe(false);
    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.reason).toContain("find_items needs a non-empty string 'query'");
  });

  it("caps hits at `limit` and reports total + truncated when more matches exist", async () => {
    const manySources: FindSources = {
      tasks: Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, title: `dentist follow-up ${i}` }))
    };
    const tool = createFindItemsTool({ find: () => manySources });
    const result = (await tool.execute({ limit: 2, query: "dentist" }, { runId: "t", userId: "u" })) as {
      hits: unknown[];
      limit: number;
      total: number;
      truncated: boolean;
    };
    expect(result.hits.length).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.total).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it("defaults the limit to 20 and does not mark truncated when everything fits", async () => {
    const tool = createFindItemsTool({ find: () => SOURCES });
    const result = (await tool.execute({ query: "dentist" }, { runId: "t", userId: "u" })) as {
      limit: number;
      total: number;
      truncated: boolean;
    };
    expect(result.limit).toBe(20);
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
  });
});
