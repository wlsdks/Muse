import { describe, expect, it } from "vitest";

import { formatBrowsingVisitLines, parseBrowsingLimit } from "./commands-browsing.js";

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
