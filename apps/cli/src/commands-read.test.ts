import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalDirNotesProvider } from "@muse/mcp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildDocumentNoteBody, saveDocumentToNotes } from "./commands-read.js";

// A telegram-bot-token shaped secret (redactSecretsInText scrubs it).
const SECRET = `123456:${"A".repeat(35)}`;

describe("buildDocumentNoteBody — ingested-document note", () => {
  it("titles by the source filename and records the source + page count", () => {
    const { title, body } = buildDocumentNoteBody("/docs/lease.pdf", "the rent is due on the 1st", 3);
    expect(title).toBe("Document — lease.pdf");
    expect(body).toContain("Source: /docs/lease.pdf (3 pages)");
    expect(body).toContain("the rent is due on the 1st");
  });

  it("uses the singular 'page' for a one-page document", () => {
    expect(buildDocumentNoteBody("/x.pdf", "hi", 1).body).toContain("(1 page)");
  });

  it("scrubs secrets out of the persisted text (a note is long-lived)", () => {
    const body = buildDocumentNoteBody("/x.pdf", `key ${SECRET} end`, 1).body;
    expect(body).not.toContain(SECRET);
    expect(body).toContain("[redacted-telegram-bot-token]");
  });
});

describe("saveDocumentToNotes — ingests a document into the searchable notes store", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "muse-read-save-")); });
  afterEach(async () => { await rm(dir, { force: true, recursive: true }); });

  it("writes a note that LocalDirNotesProvider can read back (so knowledge_search will find it)", async () => {
    await saveDocumentToNotes(dir, "lease.md", "/docs/lease.pdf", "the rent is due on the 1st of each month", 2);
    const note = await new LocalDirNotesProvider({ notesDir: dir }).read("lease.md");
    expect(note).toBeDefined();
    expect(note!.body).toContain("the rent is due on the 1st of each month");
    expect(note!.body).toContain("Source: /docs/lease.pdf (2 pages)");
  });
});
