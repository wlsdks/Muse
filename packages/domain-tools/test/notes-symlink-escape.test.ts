/**
 * The notes path guard validated containment LEXICALLY — `path.resolve(root, x)`
 * then a `startsWith(root)` check — and never collapsed symlinks. So a symlink
 * planted at `<notesDir>/x.md` → `~/.ssh/id_rsa` resolved textually under the
 * notes dir, passed the check, and `readFile` followed the link and returned
 * the target's bytes: arbitrary file read, straight past the sandbox AND the
 * credential deny-list. The sibling `@muse/fs` guard already canonicalizes;
 * this makes the notes guard match it.
 *
 * The exploit is the test: a symlink to a secret outside the notes dir must be
 * refused, while a real note beside it still reads.
 */

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createNotesMcpServer } from "../src/index.js";

const ctx = { runId: "r", userId: "u" };

describe("muse.notes refuses a symlink that escapes the notes directory", () => {
  let base: string;
  let notesDir: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "muse-notes-symlink-"));
    notesDir = join(base, "notes");
    writeFileSync(join(base, "notes-placeholder"), ""); // ensure base exists
    // notesDir + a secret sibling OUTSIDE it
    writeFileSync(join(base, "secret.txt"), "TOP-SECRET-KEY");
    rmSync(join(base, "notes-placeholder"));
    const fs = require("node:fs") as typeof import("node:fs");
    fs.mkdirSync(notesDir, { recursive: true });
    writeFileSync(join(notesDir, "real.md"), "a genuine note");
    symlinkSync(join(base, "secret.txt"), join(notesDir, "leak.md"));
    // a symlinked SUBDIR pointing outside, to catch a link in the path's middle
    symlinkSync(base, join(notesDir, "up"));
  });

  afterEach(() => {
    rmSync(base, { force: true, recursive: true });
  });

  const readTool = () => {
    const tool = createNotesMcpServer({ notesDir }).tools.find((entry) => entry.name === "read");
    if (!tool) throw new Error("notes read tool missing");
    return tool;
  };

  it("reads a genuine note (the guard must not over-block)", async () => {
    const out = await readTool().execute({ path: "real.md" }, ctx) as { content?: string; error?: string };
    expect(out.error).toBeUndefined();
    expect(out.content).toContain("genuine note");
  });

  it("refuses a symlink whose target is outside the notes dir", async () => {
    const out = await readTool().execute({ path: "leak.md" }, ctx) as { content?: string; error?: string };
    expect(out.error).toContain("escapes the notes directory");
    expect(JSON.stringify(out)).not.toContain("TOP-SECRET-KEY");
  });

  it("refuses a path that traverses a symlinked directory out of the sandbox", async () => {
    const out = await readTool().execute({ path: "up/secret.txt" }, ctx) as { content?: string; error?: string };
    expect(out.error).toBeDefined();
    expect(JSON.stringify(out)).not.toContain("TOP-SECRET-KEY");
  });
});
