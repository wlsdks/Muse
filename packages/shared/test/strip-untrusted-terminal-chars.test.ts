import { describe, expect, it } from "vitest";

import { stripUntrustedTerminalChars } from "../src/index.js";

const c = (cp: number): string => String.fromCharCode(cp);

describe("stripUntrustedTerminalChars — the cross-package terminal-safety boundary", () => {
  it("strips ESC + the rest of the C0 control range, keeping surrounding printable text intact", () => {
    // ESC (0x1b) at the head of an ANSI sequence — the [2Jdone tail is printable text that must survive.
    expect(stripUntrustedTerminalChars(`ok${c(0x1b)}[2Jdone`)).toBe("ok[2Jdone");
    // BEL (0x07) and NUL (0x00) interleaved with printable.
    expect(stripUntrustedTerminalChars(`a${c(0x07)}b${c(0x00)}c`)).toBe("abc");
  });

  it("preserves the two whitelisted C0 controls — newline (0x0a) and tab (0x09) — that legitimate text needs", () => {
    expect(stripUntrustedTerminalChars(`line1${c(0x0a)}line2`)).toBe(`line1${c(0x0a)}line2`);
    expect(stripUntrustedTerminalChars(`col1${c(0x09)}col2`)).toBe(`col1${c(0x09)}col2`);
  });

  it("strips DEL (0x7f) — the regex range mutation-proven clause", () => {
    expect(stripUntrustedTerminalChars(`safe${c(0x7f)}body`)).toBe("safebody");
  });

  it("strips the C1 high-set (0x80-0x9f) including bare 8-bit CSI (0x9b)", () => {
    expect(stripUntrustedTerminalChars(`a${c(0x9b)}b${c(0x80)}c${c(0x9f)}d`)).toBe("abcd");
  });

  it("preserves printable ASCII and multi-byte Unicode (emoji + CJK + Hangul) — only control bytes are removed", () => {
    expect(stripUntrustedTerminalChars("Hello, World!")).toBe("Hello, World!");
    expect(stripUntrustedTerminalChars("café 한글 中文 😀")).toBe("café 한글 中文 😀");
  });

  it("is idempotent on already-clean text and returns the empty string for an empty input", () => {
    expect(stripUntrustedTerminalChars("")).toBe("");
    const clean = "the quick brown fox";
    expect(stripUntrustedTerminalChars(stripUntrustedTerminalChars(clean))).toBe(clean);
  });
});
