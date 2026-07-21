import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createNotesMcpServer } from "../src/index.js";
import type { ProactiveModelProviderLike } from "@muse/proactivity";

function tool(server: ReturnType<typeof createNotesMcpServer>, name: string) {
  const t = server.tools.find((entry) => entry.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe("muse.notes.read — windowed reads (offset/maxChars) instead of always emitting the whole file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-notes-read-window-"));
  });
  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("truncates to the default maxChars when the note is longer and never floods the whole file", async () => {
    const big = "x".repeat(20_000);
    await writeFile(join(dir, "big.md"), big, "utf8");
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "read").execute({ path: "big.md" }) as {
      content: string; truncated: boolean; nextOffset?: number; returnedChars: number; offset: number;
    };
    expect(out.content.length).toBe(8000);
    expect(out.returnedChars).toBe(8000);
    expect(out.truncated).toBe(true);
    expect(out.nextOffset).toBe(8000);
    expect(out.offset).toBe(0);
  });

  it("pages via nextOffset until the whole note has been seen", async () => {
    const content = "0123456789".repeat(5); // 50 chars
    await writeFile(join(dir, "n.md"), content, "utf8");
    const server = createNotesMcpServer({ notesDir: dir });
    const first = await tool(server, "read").execute({ maxChars: 20, path: "n.md" }) as {
      content: string; truncated: boolean; nextOffset?: number;
    };
    expect(first.content).toBe(content.slice(0, 20));
    expect(first.truncated).toBe(true);
    expect(first.nextOffset).toBe(20);

    const second = await tool(server, "read").execute({ maxChars: 20, offset: first.nextOffset, path: "n.md" }) as {
      content: string; truncated: boolean; nextOffset?: number;
    };
    expect(second.content).toBe(content.slice(20, 40));
    expect(second.truncated).toBe(true);

    const third = await tool(server, "read").execute({ maxChars: 20, offset: second.nextOffset, path: "n.md" }) as {
      content: string; truncated: boolean; nextOffset?: number;
    };
    expect(third.content).toBe(content.slice(40, 50));
    expect(third.truncated).toBe(false);
    expect(third.nextOffset).toBeUndefined();
  });

  it("a short note under maxChars is returned whole and not marked truncated", async () => {
    await writeFile(join(dir, "short.md"), "hello", "utf8");
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "read").execute({ path: "short.md" }) as { content: string; truncated: boolean };
    expect(out.content).toBe("hello");
    expect(out.truncated).toBe(false);
  });

  it("an over-maxFileBytes note without an explicit window names the windowing call as the fix, not a raw size error", async () => {
    const server = createNotesMcpServer({ maxFileBytes: 1_024, notesDir: dir });
    await writeFile(join(dir, "big.md"), "y".repeat(2_000), "utf8");
    const out = await tool(server, "read").execute({ path: "big.md" }) as { error: string };
    expect(out.error).toContain("exceeds maxFileBytes");
    expect(out.error).toContain("offset");
    expect(out.error).toContain("maxChars");
    expect(out.error).toContain("big.md");
  });

  it("an over-maxFileBytes note IS readable once offset/maxChars are supplied explicitly", async () => {
    const server = createNotesMcpServer({ maxFileBytes: 1_024, notesDir: dir });
    await writeFile(join(dir, "big.md"), "z".repeat(2_000), "utf8");
    const out = await tool(server, "read").execute({ maxChars: 100, offset: 0, path: "big.md" }) as { content?: string; error?: string };
    expect(out.error).toBeUndefined();
    expect(out.content).toBe("z".repeat(100));
  });

  it("path present but not a string names the expected form + example, distinct from a missing path", async () => {
    const server = createNotesMcpServer({ notesDir: dir });
    const wrongType = await tool(server, "read").execute({ path: 123 }) as { error: string };
    expect(wrongType.error).toContain("must be a string");
    expect(wrongType.error).toContain("got number");

    const missing = await tool(server, "read").execute({}) as { error: string };
    expect(missing.error).toBe("path is required");
    expect(missing.error).not.toBe(wrongType.error);
  });

  it("a missing note names a recovery tool and never echoes the absolute filesystem path", async () => {
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "read").execute({ path: "nope.md" }) as { error: string };
    expect(out.error).not.toContain(dir);
    expect(out.error).not.toContain("/");
    expect(out.error).toContain("nope.md");
    expect(out.error).toMatch(/muse\.notes\.(search|list)/u);
  });
});

describe("muse.notes.list — limit + total/truncated + sort diagnostics", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-notes-list-limit-"));
  });
  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("defaults to 25 entries and reports the real total + truncated", async () => {
    for (let i = 0; i < 40; i += 1) {
      await writeFile(join(dir, `note-${String(i).padStart(3, "0")}.md`), "x", "utf8");
    }
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "list").execute({}) as { entries: unknown[]; total: number; truncated: boolean };
    expect(out.entries.length).toBe(25);
    expect(out.total).toBe(40);
    expect(out.truncated).toBe(true);
  });

  it("honours a supplied limit", async () => {
    for (let i = 0; i < 10; i += 1) {
      await writeFile(join(dir, `note-${String(i).padStart(2, "0")}.md`), "x", "utf8");
    }
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "list").execute({ limit: 3 }) as { entries: unknown[]; total: number; truncated: boolean };
    expect(out.entries.length).toBe(3);
    expect(out.total).toBe(10);
    expect(out.truncated).toBe(true);
  });

  it("echoes the applied sort and adds a note when an out-of-enum sort is supplied", async () => {
    await writeFile(join(dir, "a.md"), "x", "utf8");
    const server = createNotesMcpServer({ notesDir: dir });
    const directory = await tool(server, "list").execute({}) as { sort: string; note?: string };
    expect(directory.sort).toBe("directory");
    expect(directory.note).toBeUndefined();

    const recent = await tool(server, "list").execute({ sort: "recent" }) as { sort: string; note?: string };
    expect(recent.sort).toBe("recent");
    expect(recent.note).toBeUndefined();

    const invalid = await tool(server, "list").execute({ sort: "newest" }) as { sort: string; note?: string };
    expect(invalid.sort).toBe("directory");
    expect(invalid.note).toContain("newest");
    expect(invalid.note).toContain("recent");
  });

  it("a missing subdir names a recovery route and never echoes the absolute filesystem path", async () => {
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "list").execute({ subdir: "nope" }) as { error: string };
    expect(out.error).not.toContain(dir);
    expect(out.error).not.toContain("/Users");
    expect(out.error).toContain("nope");
    expect(out.error).toContain("muse.notes.list");
  });
});

describe("muse.notes.search — substring totals, per-file spread, and query type validation", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-notes-search-totals-"));
  });
  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("counts totalMatches/filesMatched across ALL notes, not just the returned slice", async () => {
    for (let i = 0; i < 5; i += 1) {
      await writeFile(join(dir, `note-${i}.md`), "budget line one\nbudget line two\nbudget line three\n", "utf8");
    }
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "search").execute({ limit: 3, query: "budget" }) as {
      matches: unknown[]; totalMatches: number; filesMatched: number; truncated: boolean;
    };
    expect(out.totalMatches).toBe(15);
    expect(out.filesMatched).toBe(5);
    expect(out.truncated).toBe(true);
    expect(out.matches.length).toBe(3);
  });

  it("caps matches per file so `limit` spreads across distinct notes instead of one file consuming it", async () => {
    for (let i = 0; i < 5; i += 1) {
      await writeFile(join(dir, `note-${i}.md`), "budget one\nbudget two\nbudget three\n", "utf8");
    }
    const server = createNotesMcpServer({ notesDir: dir });
    const out = await tool(server, "search").execute({ limit: 5, query: "budget" }) as {
      matches: Array<{ path: string }>;
    };
    const distinctPaths = new Set(out.matches.map((m) => m.path));
    expect(distinctPaths.size).toBeGreaterThan(1);
  });

  it("query present but not a string names the expected form, distinct from a missing query", async () => {
    const server = createNotesMcpServer({ notesDir: dir });
    const wrongType = await tool(server, "search").execute({ query: 42 }) as { error: string };
    expect(wrongType.error).toContain("must be a string");
    expect(wrongType.error).toContain("got number");

    const missing = await tool(server, "search").execute({}) as { error: string };
    expect(missing.error).toBe("query is required");
    expect(missing.error).not.toBe(wrongType.error);
  });
});

describe("muse.notes.search mode:'llm-judge' — distinguishes a judge failure from a genuine no-match", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-notes-search-judge-"));
    await writeFile(join(dir, "a.md"), "budget planning notes", "utf8");
  });
  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  function providerReturning(output: string): ProactiveModelProviderLike {
    return { generate: async () => ({ output }) };
  }

  it("a genuinely empty judge selection ([]) is reported as a real, parsed result", async () => {
    const server = createNotesMcpServer({
      model: "stub",
      modelProvider: providerReturning("[]"),
      notesDir: dir
    });
    const out = await tool(server, "search").execute({ mode: "llm-judge", query: "unrelated topic" }) as {
      matches: unknown[]; judgeParsed: boolean; candidatesConsidered: number; error?: string;
    };
    expect(out.error).toBeUndefined();
    expect(out.judgeParsed).toBe(true);
    expect(out.matches).toEqual([]);
    expect(out.candidatesConsidered).toBe(1);
  });

  it("unparseable judge output is reported as an error naming a fallback, never a silent empty match list", async () => {
    const server = createNotesMcpServer({
      model: "stub",
      modelProvider: providerReturning("I could not decide, sorry."),
      notesDir: dir
    });
    const out = await tool(server, "search").execute({ mode: "llm-judge", query: "the budget thing" }) as {
      matches?: unknown[]; error?: string;
    };
    expect(out.matches).toBeUndefined();
    expect(out.error).toContain("llm-judge");
    expect(out.error).toContain("substring");
  });
});
