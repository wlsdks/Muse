import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { extractMuseBundle, isSafeMuseEntry, listMuseImportEntries } from "./commands-import.js";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function makeFakeSpawn(): { spawnFn: typeof spawn; child: FakeChild } {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const spawnFn = (() => child) as unknown as typeof spawn;
  return { child, spawnFn };
}

describe("isSafeMuseEntry — tarball-restore path safety", () => {
  it("accepts normal files under .muse/", () => {
    expect(isSafeMuseEntry(".muse/tasks.json")).toBe(true);
    expect(isSafeMuseEntry(".muse/notes/daily/2026-05-25.md")).toBe(true);
  });

  it("rejects anything outside the .muse/ prefix", () => {
    expect(isSafeMuseEntry("etc/passwd")).toBe(false);
    expect(isSafeMuseEntry("../.muse/tasks.json")).toBe(false);
    expect(isSafeMuseEntry(".musexyz/x")).toBe(false);
  });

  it("rejects path-traversal segments", () => {
    expect(isSafeMuseEntry(".muse/../etc/passwd")).toBe(false);
    expect(isSafeMuseEntry(".muse/a/../../escape")).toBe(false);
  });

  it("rejects backslashes and directory entries", () => {
    expect(isSafeMuseEntry(".muse/a\\b")).toBe(false);
    expect(isSafeMuseEntry(".muse/sub/")).toBe(false);
  });
});

describe("listMuseImportEntries — UTF-8 decode across chunk boundaries (DS-17)", () => {
  it("decodes a tar-listed filename correctly when `tar -tzf` stdout is split mid-character", async () => {
    const { child, spawnFn } = makeFakeSpawn();
    const promise = listMuseImportEntries("/tmp/bundle.tar.gz", spawnFn);
    // A notes filename with a Korean title — plausible real content
    // (`muse export` bundles the notes tree verbatim).
    const full = Buffer.from(".muse/notes/회의록 정리.md\n", "utf8");
    const splitAt = 14; // mid-character inside the first Hangul run
    child.stdout.emit("data", full.subarray(0, splitAt));
    child.stdout.emit("data", full.subarray(splitAt));
    child.emit("close", 0);
    const entries = await promise;
    expect(entries).toEqual([".muse/notes/회의록 정리.md"]);
    expect(entries[0]).not.toContain("�");
  });
});

describe("extractMuseBundle — UTF-8 decode across chunk boundaries (DS-17)", () => {
  it("decodes a `tar -xzf` stderr error message correctly when split mid-character", async () => {
    const { child, spawnFn } = makeFakeSpawn();
    const promise = extractMuseBundle("/tmp/bundle.tar.gz", "/home/user", [".muse/tasks.json"], spawnFn);
    const full = Buffer.from("tar: 오류 발생 🚫", "utf8");
    const splitAt = 6; // mid-character inside a 3-byte Hangul sequence
    child.stderr.emit("data", full.subarray(0, splitAt));
    child.stderr.emit("data", full.subarray(splitAt));
    child.emit("close", 1);
    await expect(promise).rejects.toThrow("tar: 오류 발생 🚫");
  });
});
