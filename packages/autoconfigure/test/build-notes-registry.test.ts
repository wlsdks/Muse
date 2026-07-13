import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MuseEnvironment } from "../src/index.js";
import { buildNotesRegistry } from "../src/registry-builders/notes.js";

let dir: string;
let credFile: string;
let notesDir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), "build-notes-registry-"));
  // Default to an ABSENT credentials path so a real ~/.muse/credentials.json
  // on the host can never leak into these assertions (hermetic).
  credFile = join(dir, "absent-credentials.json");
  notesDir = join(dir, "notes");
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const ids = (over: Record<string, string | undefined> = {}): readonly string[] =>
  buildNotesRegistry({ MUSE_CREDENTIALS_FILE: credFile, MUSE_NOTES_DIR: notesDir, ...over } as unknown as MuseEnvironment)
    .list()
    .map((p) => p.id);

const writeCredentials = async (providers: Record<string, unknown>) => {
  await fs.writeFile(credFile, JSON.stringify({ providers }));
};

describe("buildNotesRegistry — provider-list parsing", () => {
  it("defaults to local when unset / empty / whitespace-only", () => {
    expect(ids()).toEqual(["local"]);
    expect(ids({ MUSE_NOTES_PROVIDERS: "" })).toEqual(["local"]);
    expect(ids({ MUSE_NOTES_PROVIDERS: "   " })).toEqual(["local"]);
  });

  it("splits a comma list with trim, lowercase, and empty-entry drop", () => {
    expect(ids({ MUSE_NOTES_PROVIDERS: "  LOCAL , Apple ,, " })).toEqual(["local", "apple"]);
  });

  it("preserves order (primary = first) and collapses a duplicate id", () => {
    const registry = buildNotesRegistry({
      MUSE_CREDENTIALS_FILE: credFile,
      MUSE_NOTES_DIR: notesDir,
      MUSE_NOTES_PROVIDERS: "apple,local"
    } as unknown as MuseEnvironment);
    expect(registry.list().map((p) => p.id)).toEqual(["apple", "local"]);
    expect(registry.primary()?.id).toBe("apple");
    expect(ids({ MUSE_NOTES_PROVIDERS: "local,local" })).toEqual(["local"]);
  });

  it("silently skips an unknown provider id", () => {
    expect(ids({ MUSE_NOTES_PROVIDERS: "local,bogus" })).toEqual(["local"]);
  });
});

describe("buildNotesRegistry — local + apple", () => {
  it("always builds local", () => {
    expect(buildNotesRegistry({ MUSE_CREDENTIALS_FILE: credFile, MUSE_NOTES_DIR: notesDir } as unknown as MuseEnvironment).has("local")).toBe(true);
  });

  it("registers apple with no folder, an env folder, or a credentials-file folder", async () => {
    expect(ids({ MUSE_NOTES_PROVIDERS: "apple" })).toEqual(["apple"]);
    expect(ids({ MUSE_NOTES_PROVIDERS: "apple", MUSE_APPLE_NOTES_FOLDER: "Work" })).toEqual(["apple"]);
    await writeCredentials({ apple: { folder: "FromFile" } });
    expect(ids({ MUSE_NOTES_PROVIDERS: "apple" })).toEqual(["apple"]);
  });
});

describe("buildNotesRegistry — notion token gate (resolves credentials file, then env)", () => {
  it("registers when a token comes from the env", () => {
    expect(ids({ MUSE_NOTES_PROVIDERS: "notion", MUSE_NOTION_TOKEN: "env-token" })).toEqual(["notion"]);
  });

  it("registers when a token comes from the credentials file (providers.notion.token)", async () => {
    await writeCredentials({ notion: { databaseId: "db", titleProperty: "Title", token: "file-token" } });
    expect(ids({ MUSE_NOTES_PROVIDERS: "notion" })).toEqual(["notion"]);
  });

  it("is skipped when no token is available anywhere", () => {
    expect(ids({ MUSE_NOTES_PROVIDERS: "notion" })).toEqual([]);
  });

  it("is skipped without a token but leaves other providers intact", () => {
    expect(ids({ MUSE_NOTES_PROVIDERS: "local,notion" })).toEqual(["local"]);
  });

  it("falls back to the env token when the credentials file is corrupt", async () => {
    await fs.writeFile(credFile, "{ not valid json");
    expect(ids({ MUSE_NOTES_PROVIDERS: "notion", MUSE_NOTION_TOKEN: "env-token" })).toEqual(["notion"]);
  });

  it("falls back to the env token when the credentials file lacks a providers key", async () => {
    await fs.writeFile(credFile, JSON.stringify({ somethingElse: true }));
    expect(ids({ MUSE_NOTES_PROVIDERS: "notion", MUSE_NOTION_TOKEN: "env-token" })).toEqual(["notion"]);
  });

  it("registers with optional databaseId / titleProperty overrides from the env", () => {
    expect(
      ids({
        MUSE_NOTES_PROVIDERS: "notion",
        MUSE_NOTION_DATABASE_ID: "db123",
        MUSE_NOTION_TITLE_PROPERTY: "Heading",
        MUSE_NOTION_TOKEN: "env-token"
      })
    ).toEqual(["notion"]);
  });
});

describe("T2-B1 local-only containment", () => {
  it("keeps local and Apple Notes while omitting Notion before shared credential access", async () => {
    await writeCredentials({ notion: { databaseId: "database", token: "file-token" } });

    expect(ids({
      MUSE_APPLE_NOTES_FOLDER: "Local Folder",
      MUSE_LOCAL_ONLY: "true",
      MUSE_NOTES_PROVIDERS: "local,apple,notion",
      MUSE_NOTION_DATABASE_ID: "env-database",
      MUSE_NOTION_TOKEN: "env-token"
    })).toEqual(["local", "apple"]);
  });
});
