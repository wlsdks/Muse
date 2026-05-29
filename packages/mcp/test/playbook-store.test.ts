import { rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type PlaybookEntry, readPlaybook, removePlaybookStrategy, writePlaybook } from "../src/personal-playbook-store.js";

const entry = (id: string, tag?: string): PlaybookEntry => ({
  id,
  userId: "u1",
  text: "when rescheduling, default to the next business day",
  createdAt: "2026-01-01T00:00:00Z",
  ...(tag ? { tag } : {}),
});

let files: string[] = [];
const freshFile = () => {
  const file = join(tmpdir(), `muse-playbook-${files.length}-${process.pid}.json`);
  files.push(file);
  return file;
};
afterEach(async () => {
  await Promise.all(files.map((f) => rm(f, { force: true })));
  files = [];
});

describe("readPlaybook / writePlaybook", () => {
  it("round-trips entries (including the optional tag) with 0600 perms", async () => {
    const file = freshFile();
    await writePlaybook(file, [entry("a", "email"), entry("b")]);
    expect((await readPlaybook(file)).map((e) => ({ id: e.id, tag: e.tag }))).toEqual([
      { id: "a", tag: "email" },
      { id: "b", tag: undefined },
    ]);
    expect((await stat(file)).mode.toString(8).slice(-3)).toBe("600");
  });

  it("returns [] for a missing file and for a corrupt one", async () => {
    const missing = freshFile();
    expect(await readPlaybook(missing)).toEqual([]);
    const corrupt = freshFile();
    await writeFile(corrupt, "not json", { mode: 0o600 });
    expect(await readPlaybook(corrupt)).toEqual([]);
  });

  it("writes an empty list and reads it back empty", async () => {
    const file = freshFile();
    await writePlaybook(file, []);
    expect(await readPlaybook(file)).toEqual([]);
  });
});

describe("removePlaybookStrategy", () => {
  it("removes a matching id and reports true", async () => {
    const file = freshFile();
    await writePlaybook(file, [entry("a"), entry("b")]);
    await expect(removePlaybookStrategy(file, "a")).resolves.toBe(true);
    expect((await readPlaybook(file)).map((e) => e.id)).toEqual(["b"]);
  });

  it("reports false and changes nothing when the id is absent", async () => {
    const file = freshFile();
    await writePlaybook(file, [entry("a")]);
    await expect(removePlaybookStrategy(file, "missing")).resolves.toBe(false);
    expect((await readPlaybook(file)).map((e) => e.id)).toEqual(["a"]);
  });

  it("reports false on an empty / missing store", async () => {
    const file = freshFile();
    await expect(removePlaybookStrategy(file, "anything")).resolves.toBe(false);
  });
});
