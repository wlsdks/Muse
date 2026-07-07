import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { webkitTimeToIso } from "./browsing-store.js";
import { locateChromeHistoryFile, readChromeHistoryVisits } from "./chrome-history.js";

interface SeedRow {
  readonly id: number;
  readonly url: string;
  readonly title: string | null;
  readonly visitTime: number;
}

function buildFixtureDb(file: string, rows: readonly SeedRow[]): void {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER)");
  db.exec("CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER)");
  const insertUrl = db.prepare("INSERT INTO urls(id, url, title, visit_count) VALUES(?, ?, ?, 1)");
  const insertVisit = db.prepare("INSERT INTO visits(id, url, visit_time) VALUES(?, ?, ?)");
  for (const row of rows) {
    insertUrl.run(row.id, row.url, row.title);
    // visit_time exceeds Number.MAX_SAFE_INTEGER, so bind it as a BigInt like real Chrome rows.
    insertVisit.run(row.id, row.id, BigInt(row.visitTime));
  }
  db.close();
}

const CURSOR = 13_390_000_000_000_000;

describe("readChromeHistoryVisits — fixture db", () => {
  let dir: string;
  let historyFile: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-chrome-"));
    historyFile = join(dir, "History");
    buildFixtureDb(historyFile, [
      { id: 1, url: "https://blog.example/rust", title: "Rust ownership guide", visitTime: CURSOR + 2_000_000 },
      { id: 2, url: "https://old.example/page", title: "Old page", visitTime: CURSOR - 5_000_000 },
      { id: 3, url: "chrome://settings", title: "Settings", visitTime: CURSOR + 3_000_000 },
      { id: 4, url: "https://notitle.example/x?q=1", title: null, visitTime: CURSOR + 4_000_000 }
    ]);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns http(s) visits newer than the cursor, newest ordering by visit_time asc from query", async () => {
    const visits = await readChromeHistoryVisits(historyFile, { sinceVisitTime: CURSOR, limit: 100 });
    const ids = visits.map((v) => v.url);
    // id=2 excluded (before cursor); id=3 excluded (chrome:// scheme).
    expect(ids).toContain("https://blog.example/rust");
    expect(ids).toContain("https://notitle.example/x?q=1");
    expect(ids).not.toContain("chrome://settings");
    expect(ids).not.toContain("https://old.example/page");
  });

  it("drops chrome:// (scheme filter)", async () => {
    const visits = await readChromeHistoryVisits(historyFile, { sinceVisitTime: 0, limit: 100 });
    expect(visits.some((v) => v.url.startsWith("chrome://"))).toBe(false);
  });

  it("falls back to hostname for an empty title", async () => {
    const visits = await readChromeHistoryVisits(historyFile, { sinceVisitTime: CURSOR, limit: 100 });
    const noTitle = visits.find((v) => v.url === "https://notitle.example/x?q=1");
    expect(noTitle!.title).toBe("notitle.example");
  });

  it("converts visit_time to the matching ISO instant", async () => {
    const visits = await readChromeHistoryVisits(historyFile, { sinceVisitTime: CURSOR, limit: 100 });
    const rust = visits.find((v) => v.url === "https://blog.example/rust");
    expect(rust!.visitedAt).toBe(webkitTimeToIso(CURSOR + 2_000_000));
  });

  it("reads a COPY — the original History file is left byte-identical", async () => {
    const before = await readFile(historyFile);
    await readChromeHistoryVisits(historyFile, { sinceVisitTime: 0, limit: 100 });
    const after = await readFile(historyFile);
    expect(after.equals(before)).toBe(true);
  });

  it("is fail-soft: a missing file yields []", async () => {
    expect(await readChromeHistoryVisits(join(dir, "does-not-exist"), {})).toEqual([]);
  });

  it("is fail-soft: a non-sqlite file yields []", async () => {
    const junk = join(dir, "junk");
    await (await import("node:fs/promises")).writeFile(junk, "not a database", "utf8");
    expect(await readChromeHistoryVisits(junk, {})).toEqual([]);
  });
});

describe("locateChromeHistoryFile", () => {
  it("honours MUSE_CHROME_HISTORY_FILE when it exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "muse-locate-"));
    const file = join(dir, "History");
    buildFixtureDb(file, [{ id: 1, url: "https://x", title: "x", visitTime: CURSOR }]);
    const located = await locateChromeHistoryFile({ env: { MUSE_CHROME_HISTORY_FILE: file } });
    expect(located).toBe(file);
    await rm(dir, { recursive: true, force: true });
  });

  it("returns undefined when the default path does not exist", async () => {
    const located = await locateChromeHistoryFile({ env: {}, homeDir: "/nonexistent-home-xyz" });
    expect(located).toBeUndefined();
  });

  it("swaps the profile via MUSE_CHROME_PROFILE (resolves under a missing dir → undefined)", async () => {
    const located = await locateChromeHistoryFile({ env: { MUSE_CHROME_PROFILE: "Profile 1" }, homeDir: "/nonexistent-home-xyz" });
    expect(located).toBeUndefined();
  });
});
