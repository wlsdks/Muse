import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import { escapeAppleScript, isPermissionError, parseWifiDevice, runChild } from "../src/macos-exec.js";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: EventEmitter & { write: (chunk: unknown) => void; end: () => void };
  kill: (signal?: string) => boolean;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const stdin = new EventEmitter() as FakeChild["stdin"];
  stdin.write = () => undefined;
  stdin.end = () => undefined;
  child.stdin = stdin;
  child.kill = () => true;
  return child;
}

describe("escapeAppleScript", () => {
  it("backslash-escapes backslashes and double-quotes for an AppleScript string literal", () => {
    expect(escapeAppleScript('say "hi"')).toBe('say \\"hi\\"');
    expect(escapeAppleScript("a\\b")).toBe("a\\\\b");
    // backslash is escaped first, so a quote-after-backslash stays two escapes
    expect(escapeAppleScript('\\"')).toBe('\\\\\\"');
  });

  it("flattens newlines (CR/LF and runs) to a single space — AppleScript literals can't carry a raw newline", () => {
    expect(escapeAppleScript("line1\nline2")).toBe("line1 line2");
    expect(escapeAppleScript("a\r\n\nb")).toBe("a b");
    expect(escapeAppleScript("a\r\rb")).toBe("a b");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeAppleScript("hello world")).toBe("hello world");
    expect(escapeAppleScript("")).toBe("");
  });
});

describe("isPermissionError", () => {
  it("matches the canonical osascript -1743 not-authorised codes/phrasings (case-insensitive)", () => {
    expect(isPermissionError("execution error: not authorized to send Apple events (-1743)")).toBe(true);
    expect(isPermissionError("error -1743")).toBe(true);
    expect(isPermissionError("Not Allowed")).toBe(true);
    expect(isPermissionError("you don't have permission")).toBe(true);
    expect(isPermissionError("not authorised")).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isPermissionError("command not found")).toBe(false);
    expect(isPermissionError("timed out")).toBe(false);
    expect(isPermissionError("")).toBe(false);
  });
});

describe("runChild — UTF-8 decode across chunk boundaries (DS-17)", () => {
  it("decodes a multi-byte character correctly when split across two stdout `data` events", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const promise = runChild("echo", [], undefined, 5_000, spawnFn);
    // "한글 🎉" split mid-character: the first byte of the 3-byte 한 (U+D55C)
    // arrives in chunk 1, the remaining bytes in chunk 2.
    const full = Buffer.from("한글 🎉 emoji test", "utf8");
    const splitAt = 1;
    child.stdout.emit("data", full.subarray(0, splitAt));
    child.stdout.emit("data", full.subarray(splitAt));
    child.emit("close", 0);
    const result = await promise;
    expect(result.stdout).toBe("한글 🎉 emoji test");
    expect(result.stdout).not.toContain("�");
  });

  it("decodes a multi-byte character correctly when split across two stderr `data` events", async () => {
    const child = makeFakeChild();
    const spawnFn = vi.fn(() => child) as unknown as typeof spawn;
    const promise = runChild("echo", [], undefined, 5_000, spawnFn);
    const full = Buffer.from("오류: 파일 없음 🚫", "utf8");
    const splitAt = 4;
    child.stderr.emit("data", full.subarray(0, splitAt));
    child.stderr.emit("data", full.subarray(splitAt));
    child.emit("close", 1);
    const result = await promise;
    expect(result.stderr).toBe("오류: 파일 없음 🚫");
    expect(result.stderr).not.toContain("�");
  });
});

describe("parseWifiDevice", () => {
  const ports = [
    "Hardware Port: Ethernet",
    "Device: en1",
    "",
    "Hardware Port: Wi-Fi",
    "Device: en0",
    ""
  ].join("\n");

  it("returns the Device on the line after the Wi-Fi hardware port", () => {
    expect(parseWifiDevice(ports)).toBe("en0");
  });

  it("returns undefined when there is no Wi-Fi hardware port", () => {
    expect(parseWifiDevice("Hardware Port: Ethernet\nDevice: en1\n")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(parseWifiDevice("")).toBeUndefined();
  });
});
