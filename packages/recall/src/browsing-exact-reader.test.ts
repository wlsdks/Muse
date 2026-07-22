import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readExactBrowsingVisit } from "./index.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function archive(contents: unknown): Promise<{ readonly file: string; readonly raw: string }> {
  const root = await mkdtemp(join(tmpdir(), "muse-browsing-exact-"));
  roots.push(root);
  const file = join(root, "browsing.json");
  const raw = `${JSON.stringify(contents, null, 2)}\n`;
  await writeFile(file, raw, "utf8");
  return { file, raw };
}

describe("readExactBrowsingVisit", () => {
  it("returns one byte-identical visit without its embedding and preserves archive bytes", async () => {
    const id = "13390000000000000-0a1b2c3d";
    const stored = await archive({
      lastVisitTimeCursor: 13_390_000_000_000_000,
      version: 1,
      visits: [{
        embedding: [0.1, 0.2],
        id,
        title: "Exact page",
        url: "https://example.com/exact",
        visitedAt: "2026-07-22T01:00:00.000Z"
      }]
    });

    await expect(readExactBrowsingVisit(stored.file, id)).resolves.toEqual({
      id,
      title: "Exact page",
      url: "https://example.com/exact",
      visitedAt: "2026-07-22T01:00:00.000Z"
    });
    expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
  });

  it("rejects duplicate byte-identical visit ids without choosing either record", async () => {
    const id = "13390000000000000-0a1b2c3d";
    const stored = await archive({
      lastVisitTimeCursor: 13_390_000_000_000_000,
      version: 1,
      visits: [
        { id, title: "First", url: "https://example.com/first", visitedAt: "2026-07-22T01:00:00.000Z" },
        { id, title: "Second", url: "https://example.com/second", visitedAt: "2026-07-22T01:01:00.000Z" }
      ]
    });

    await expect(readExactBrowsingVisit(stored.file, id)).rejects.toThrow("duplicate browsing visit id");
    expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
  });

  it("rejects a future archive version without renaming or writing the archive", async () => {
    const id = "13390000000000000-0a1b2c3d";
    const stored = await archive({
      lastVisitTimeCursor: 13_390_000_000_000_000,
      version: 999,
      visits: [{ id, title: "Future", url: "https://example.com/future", visitedAt: "2026-07-22T01:00:00.000Z" }]
    });
    const pathsBefore = await readdir(dirname(stored.file));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(readExactBrowsingVisit(stored.file, id)).rejects.toThrow("unsupported browsing archive version");
    expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
    expect(await readdir(dirname(stored.file))).toEqual(pathsBefore);
    expect(logged).not.toHaveBeenCalled();
  });

  it("rejects malformed archive JSON without changing its bytes or path", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-browsing-exact-"));
    roots.push(root);
    const file = join(root, "browsing.json");
    const raw = "{not-json}\n";
    await writeFile(file, raw, "utf8");
    const pathsBefore = await readdir(root);

    await expect(readExactBrowsingVisit(file, "13390000000000000-0a1b2c3d"))
      .rejects.toThrow("browsing archive is not valid JSON");
    expect(await readFile(file, "utf8")).toBe(raw);
    expect(await readdir(root)).toEqual(pathsBefore);
  });

  it("rejects a malformed archive shape instead of treating it as a missing visit", async () => {
    const stored = await archive({ lastVisitTimeCursor: 0, version: 1, visits: "not-an-array" });

    await expect(readExactBrowsingVisit(stored.file, "13390000000000000-0a1b2c3d"))
      .rejects.toThrow("browsing archive has an invalid visits collection");
    expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
  });

  it("rejects a non-object archive root through the typed fail-closed boundary", async () => {
    const stored = await archive(null);

    await expect(readExactBrowsingVisit(stored.file, "13390000000000000-0a1b2c3d"))
      .rejects.toThrow("browsing archive root must be an object");
    expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
  });

  it("rejects a matching record with malformed projected fields", async () => {
    const id = "13390000000000000-0a1b2c3d";
    const stored = await archive({
      lastVisitTimeCursor: 13_390_000_000_000_000,
      version: 1,
      visits: [{ id, title: 42, url: "https://example.com", visitedAt: "2026-07-22T01:00:00.000Z" }]
    });

    await expect(readExactBrowsingVisit(stored.file, id))
      .rejects.toThrow("matching browsing visit has invalid fields");
    expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
  });

  it("rejects malformed nonmatching records instead of reporting a clean exact match", async () => {
    const id = "13390000000000000-0a1b2c3d";
    const stored = await archive({
      lastVisitTimeCursor: 13_390_000_000_000_000,
      version: 1,
      visits: [
        { id, title: "Exact", url: "https://example.com/exact", visitedAt: "2026-07-22T01:00:00.000Z" },
        { id: "13390000001000000-1a2b3c4d", title: 42, url: "https://example.com/broken", visitedAt: "2026-07-22T01:01:00.000Z" }
      ]
    });

    await expect(readExactBrowsingVisit(stored.file, id))
      .rejects.toThrow("browsing archive contains an invalid visit");
    expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
  });

  it("rejects a missing or invalid required archive cursor", async () => {
    for (const lastVisitTimeCursor of [undefined, -1, Number.NaN]) {
      const stored = await archive({
        ...(lastVisitTimeCursor === undefined ? {} : { lastVisitTimeCursor }),
        version: 1,
        visits: []
      });
      await expect(readExactBrowsingVisit(stored.file, "13390000000000000-0a1b2c3d"))
        .rejects.toThrow("browsing archive has an invalid cursor");
      expect(await readFile(stored.file, "utf8")).toBe(stored.raw);
    }
  });

  it("distinguishes a missing archive from another filesystem read failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-browsing-exact-"));
    roots.push(root);

    await expect(readExactBrowsingVisit(root, "13390000000000000-0a1b2c3d"))
      .rejects.toThrow("cannot read browsing archive");
    await expect(readExactBrowsingVisit(join(root, "missing.json"), "13390000000000000-0a1b2c3d"))
      .resolves.toBeUndefined();
  });
});
