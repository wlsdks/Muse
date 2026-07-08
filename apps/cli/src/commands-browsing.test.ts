import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeBrowsingStore, type BrowsingVisit } from "@muse/recall";
import { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  browsingGroundedVerdict,
  formatBrowsingVisitLines,
  parseBrowsingLimit,
  registerBrowsingCommand,
  toBrowsingCitations
} from "./commands-browsing.js";
import type { ProgramIO } from "./program.js";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

function hasTerminalControl(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c <= 0x08 || (c >= 0x0b && c <= 0x1f) || c === 0x7f) return true;
  }
  return false;
}

describe("formatBrowsingVisitLines", () => {
  it("strips terminal control sequences from the page-controlled title + url", () => {
    const lines = formatBrowsingVisitLines({
      title: `${ESC}[2J${ESC}]0;pwned${BEL}Malicious page`,
      url: `https://evil.example/${ESC}[31m`,
      visitedAt: "2026-05-18T09:00:00Z"
    });
    const joined = lines.join("\n");
    expect(hasTerminalControl(joined)).toBe(false);
    expect(joined).toContain("Malicious page");
    expect(joined).toContain("2026-05-18T09:00:00Z");
  });

  it("collapses newlines and falls back to (no title)/(no date)", () => {
    const lines = formatBrowsingVisitLines({ title: "multi\nline\ntitle", url: "", visitedAt: "   " });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("multi line title — (no date)");
    expect(formatBrowsingVisitLines({ title: "  ", url: "https://x", visitedAt: "2026" })[0]).toBe("(no title) — 2026");
  });

  it("leaves a clean visit untouched", () => {
    expect(formatBrowsingVisitLines({
      title: "Rust ownership guide",
      url: "https://blog.example/rust",
      visitedAt: "2026-05-18T09:00:00Z"
    })).toEqual([
      "Rust ownership guide — 2026-05-18T09:00:00Z",
      "  https://blog.example/rust"
    ]);
  });
});

describe("parseBrowsingLimit", () => {
  it("returns the fallback when absent/blank", () => {
    expect(parseBrowsingLimit(undefined, 20, 100)).toBe(20);
    expect(parseBrowsingLimit("   ", 20, 100)).toBe(20);
  });

  it("truncates and clamps to the cap", () => {
    expect(parseBrowsingLimit("5", 20, 100)).toBe(5);
    expect(parseBrowsingLimit("999", 20, 100)).toBe(100);
    expect(parseBrowsingLimit("7.9", 20, 100)).toBe(7);
  });

  it("rejects a unit-slip / non-positive value", () => {
    expect(() => parseBrowsingLimit("20x", 20, 100)).toThrow(/positive number/);
    expect(() => parseBrowsingLimit("0", 20, 100)).toThrow(/positive number/);
    expect(() => parseBrowsingLimit("-3", 20, 100)).toThrow(/positive number/);
  });
});

describe("browsingGroundedVerdict", () => {
  it("is grounded when at least one real citation backs the query", () => {
    expect(browsingGroundedVerdict(1)).toBe("grounded");
    expect(browsingGroundedVerdict(5)).toBe("grounded");
  });

  it("abstains when the local archive has nothing to ground on", () => {
    expect(browsingGroundedVerdict(0)).toBe("abstain");
  });
});

describe("toBrowsingCitations", () => {
  it("reshapes matched visits into ask-parity citations with full score", () => {
    expect(toBrowsingCitations([
      { url: "https://blog.example/rust", title: "Rust ownership guide", visitedAt: "2026-05-18T09:00:00Z" }
    ])).toEqual([
      { url: "https://blog.example/rust", title: "Rust ownership guide", visitedAt: "2026-05-18T09:00:00Z", score: 1 }
    ]);
  });

  it("returns an empty array for no hits", () => {
    expect(toBrowsingCitations([])).toEqual([]);
  });
});

describe("muse browsing search --json", () => {
  function fakeIo(stdout: string[], stderr: string[]): ProgramIO {
    return { stderr: (m) => stderr.push(m), stdout: (m) => stdout.push(m) };
  }

  async function runSearch(
    storeFile: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const prev = process.env.MUSE_BROWSING_FILE;
    process.env.MUSE_BROWSING_FILE = storeFile;
    let exitCode: number | undefined;
    try {
      const program = new Command();
      program.exitOverride();
      registerBrowsingCommand(program, fakeIo(stdoutLines, stderrLines));
      await program.parseAsync(["node", "muse", "browsing", "search", ...args]);
    } catch (cause) {
      exitCode = (cause as { exitCode?: number }).exitCode ?? 1;
    } finally {
      if (prev === undefined) delete process.env.MUSE_BROWSING_FILE;
      else process.env.MUSE_BROWSING_FILE = prev;
    }
    return { stdout: stdoutLines.join(""), stderr: stderrLines.join(""), exitCode };
  }

  function visit(overrides: Partial<BrowsingVisit> = {}): BrowsingVisit {
    return {
      id: "v1",
      url: "https://blog.example/rust",
      title: "Rust ownership guide",
      visitedAt: "2026-05-18T09:00:00Z",
      ...overrides
    };
  }

  it("emits a grounded block matching `muse ask --json`'s contract shape, pure JSON on stdout, exit 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-browsing-json-"));
    const file = join(dir, "browsing.json");
    try {
      await writeBrowsingStore(file, {
        version: 1,
        visits: [visit(), visit({ id: "v2", url: "https://other.example", title: "unrelated page", visitedAt: "2026-05-17T00:00:00Z" })],
        lastVisitTimeCursor: 0
      });
      const { stdout, stderr, exitCode } = await runSearch(file, ["rust", "--json"]);

      expect(exitCode).toBeUndefined();
      expect(stderr).toBe("");
      // Pure JSON — no chatter/hint lines mixed into stdout.
      const parsed: unknown = JSON.parse(stdout);
      expect(parsed).toMatchObject({
        query: "rust",
        total: 1,
        // groundedVerdict + grounded.citations mirror `muse ask --json`'s
        // { groundedVerdict, grounded: { noteChunks: [{ ..., score }] } } shape.
        groundedVerdict: "grounded",
        grounded: {
          citations: [
            { url: "https://blog.example/rust", title: "Rust ownership guide", visitedAt: "2026-05-18T09:00:00Z", score: 1 }
          ]
        }
      });
      // Existing `visits` field is preserved (additive change, not breaking).
      expect((parsed as { visits: unknown[] }).visits).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("abstains (empty citations) when no visit matches, still pure JSON on stdout, exit 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-browsing-json-"));
    const file = join(dir, "browsing.json");
    try {
      await writeBrowsingStore(file, { version: 1, visits: [visit()], lastVisitTimeCursor: 0 });
      const { stdout, stderr, exitCode } = await runSearch(file, ["no-such-keyword-xyz", "--json"]);

      expect(exitCode).toBeUndefined();
      expect(stderr).toBe("");
      const parsed: unknown = JSON.parse(stdout);
      expect(parsed).toMatchObject({
        total: 0,
        groundedVerdict: "abstain",
        grounded: { citations: [] }
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
