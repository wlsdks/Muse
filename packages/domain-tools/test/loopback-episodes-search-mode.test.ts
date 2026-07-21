/**
 * `mode: "semantic"` (a name outside the declared enum) used to be
 * silently coerced to "substring" — the response echoed the corrected
 * mode, but that is not a disclosure that the request changed, and an
 * empty substring result was returned as if it had answered the actual
 * question. A caller-supplied, out-of-enum `mode` is now a hard error
 * naming the two valid values (tool-calling.md rule: an error message
 * is a repair instruction).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createEpisodesMcpServer } from "../src/loopback-episodes.js";
import { writeEpisodes, type PersistedEpisode } from "@muse/stores";

const ep = (id: string): PersistedEpisode => ({
  endedAt: "2026-06-01T00:00:00Z",
  id,
  startedAt: "2026-06-01T00:00:00Z",
  summary: `s-${id}`,
  topics: [],
  userId: "stark"
});

function freshFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-ep-mode-")), "episodes.json");
}

function searchTool(file: string) {
  const found = createEpisodesMcpServer({ file }).tools.find((t) => t.name === "search");
  if (!found) throw new Error("search tool not found");
  return found;
}

describe("muse.episode.search rejects an out-of-enum mode", () => {
  it("errors, naming both valid modes, instead of silently coercing to substring", async () => {
    const file = freshFile();
    await writeEpisodes(file, [ep("a")]);
    const out = await searchTool(file).execute({ mode: "semantic", query: "s-" }) as { error?: string; episodes?: unknown[] };
    expect(out.error).toBeDefined();
    expect(out.error).toContain("substring");
    expect(out.error).toContain("llm-judge");
    expect(out.episodes).toBeUndefined();
  });

  it("stays silent (no error) for each valid enum value", async () => {
    const file = freshFile();
    await writeEpisodes(file, [ep("a")]);
    const out = await searchTool(file).execute({ mode: "substring", query: "s-" }) as { error?: string; mode?: string };
    expect(out.error).toBeUndefined();
    expect(out.mode).toBe("substring");
  });

  it("defaults to substring silently when mode is omitted", async () => {
    const file = freshFile();
    await writeEpisodes(file, [ep("a")]);
    const out = await searchTool(file).execute({ query: "s-" }) as { error?: string; mode?: string };
    expect(out.error).toBeUndefined();
    expect(out.mode).toBe("substring");
  });
});
