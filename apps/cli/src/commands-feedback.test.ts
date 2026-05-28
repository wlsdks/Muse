import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addCorrection, readCorrections, renderCorrectionsBlock, resolveCorrectionsFile } from "./commands-feedback.js";

describe("renderCorrectionsBlock", () => {
  it("renders a [Learned Corrections] directive, or undefined when empty", () => {
    expect(renderCorrectionsBlock([])).toBeUndefined();
    expect(renderCorrectionsBlock([{ id: "x", at: "now", text: "   " }])).toBeUndefined();
    const block = renderCorrectionsBlock([
      { id: "1", at: "t", text: "always cite the source file" },
      { id: "2", at: "t", text: "never invent dates" }
    ]);
    expect(block).toContain("[Learned Corrections");
    expect(block).toContain("- always cite the source file");
    expect(block).toContain("- never invent dates");
  });
});

describe("resolveCorrectionsFile", () => {
  it("honors MUSE_CORRECTIONS_FILE, then MUSE_HOME, then ~/.muse", () => {
    expect(resolveCorrectionsFile({ MUSE_CORRECTIONS_FILE: "/c/x.json" })).toBe("/c/x.json");
    expect(resolveCorrectionsFile({ MUSE_HOME: "/home/u/.muse" })).toBe("/home/u/.muse/corrections.json");
  });
});

describe("addCorrection + readCorrections (round-trip)", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-feedback-"));
    file = join(dir, "corrections.json");
  });
  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("persists a normalized correction and reads it back", async () => {
    const entry = await addCorrection(file, "  be   concise  ", new Date("2026-05-28T00:00:00Z"));
    expect(entry.text).toBe("be concise");
    expect(entry.id).toMatch(/^corr_/u);
    const all = await readCorrections(file);
    expect(all.map((c) => c.text)).toEqual(["be concise"]);
  });

  it("appends across calls and the JSON is valid", async () => {
    await addCorrection(file, "first");
    await addCorrection(file, "second");
    const all = await readCorrections(file);
    expect(all.map((c) => c.text)).toEqual(["first", "second"]);
    expect(JSON.parse(await readFile(file, "utf8"))).toHaveLength(2);
  });

  it("reads [] for a missing or malformed file (fail-open)", async () => {
    expect(await readCorrections(join(dir, "nope.json"))).toEqual([]);
    await (await import("node:fs/promises")).writeFile(file, "{ not json", "utf8");
    expect(await readCorrections(file)).toEqual([]);
  });
});
