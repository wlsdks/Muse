import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareAskContext } from "./ask-context-setup.js";
import { reindexNotes } from "./commands-notes-rag.js";
import type { ProgramIO } from "./program.js";

const fakeEmbedFetch: typeof globalThis.fetch = async () =>
  new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3, 0.4] }), { status: 200 });

function collectIo(): { io: ProgramIO; err: string[] } {
  const err: string[] = [];
  return {
    err,
    io: { stderr: (text: string) => { err.push(text); }, stdout: () => { /* unused */ } } as unknown as ProgramIO
  };
}

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["MUSE_NOTES_DIR", "MUSE_NOTES_INDEX_FILE"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("prepareAskContext v2 sidecar hydration", () => {
  it("returns an index whose chunks carry REAL embedding vectors (not the raw embedding-less JSON)", async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    const dir = await mkdtemp(join(tmpdir(), "muse-ask-ctx-"));
    const notesDir = join(dir, "notes");
    const indexPath = join(dir, "notes-index.json");
    process.env.MUSE_NOTES_DIR = notesDir;
    process.env.MUSE_NOTES_INDEX_FILE = indexPath;
    await writeFile(join(dir, "seed.tmp"), "");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(notesDir, { recursive: true });
    await writeFile(join(notesDir, "plan.md"), "Cake from the bakery, invite two friends.");
    const summary = await reindexNotes({ dir: notesDir, fetchImpl: fakeEmbedFetch, indexPath, model: "fake-embed" });
    expect(summary.embedded).toBe(1);

    const { io } = collectIo();
    const context = await prepareAskContext(
      "what was the plan?",
      { autoReindex: false, embedModel: "fake-embed" } as never,
      io
    );
    expect(context.kind).toBe("ready");
    if (context.kind !== "ready") return;
    const chunks = context.index.files.flatMap((file) => file.chunks);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      // The v2 index stores embeddings in the Float32 sidecar; a loader that
      // raw-parses the JSON returns embedding-less chunks and every cosine
      // ranking in `muse ask` dies (regression: 2026-07-18).
      const embedding = (chunk as { embedding?: ArrayLike<number> }).embedding;
      expect(embedding).toBeDefined();
      expect(embedding!.length).toBeGreaterThan(0);
    }
  });
});
