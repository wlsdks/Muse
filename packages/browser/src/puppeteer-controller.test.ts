import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeBrowserTimeout, PuppeteerBrowserController } from "./puppeteer-controller.js";

describe("normalizeBrowserTimeout", () => {
  it("falls back for invalid timer values and clamps Node timer overflow", () => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeBrowserTimeout(value, 15_000)).toBe(15_000);
    }
    expect(normalizeBrowserTimeout(Number.MAX_SAFE_INTEGER, 15_000)).toBe(2_147_483_647);
  });
});

describe("hasOpenPage — never launches a browser to answer", () => {
  let scratchDir: string | undefined;

  afterEach(async () => {
    if (scratchDir) await rm(scratchDir, { force: true, recursive: true });
    scratchDir = undefined;
  });

  it("reports false when no Chrome is reachable, without spawning one", async () => {
    // A fresh profile dir has no DevToolsActivePort file, so connectToExisting
    // fails fast (readFile ENOENT, caught) — hasOpenPage must return false
    // from THAT path alone, never fall through to launchDetached.
    scratchDir = await mkdtemp(join(tmpdir(), "muse-browser-test-"));
    const controller = new PuppeteerBrowserController({ userDataDir: scratchDir });
    await expect(controller.hasOpenPage()).resolves.toBe(false);
  });
});
