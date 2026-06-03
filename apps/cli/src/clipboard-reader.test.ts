import { describe, expect, it } from "vitest";

import { clipboardCommand, readClipboardText } from "./clipboard-reader.js";

describe("clipboardCommand — platform → clipboard tool mapping (pure)", () => {
  it("maps macOS to pbpaste", () => {
    expect(clipboardCommand("darwin")).toEqual({ args: [], cmd: "pbpaste" });
  });

  it("maps Windows to PowerShell Get-Clipboard", () => {
    expect(clipboardCommand("win32")).toEqual({ args: ["-NoProfile", "-Command", "Get-Clipboard"], cmd: "powershell" });
  });

  it("maps Linux to xclip reading the clipboard selection", () => {
    expect(clipboardCommand("linux")).toEqual({ args: ["-selection", "clipboard", "-o"], cmd: "xclip" });
  });

  it("returns undefined for a platform with no known clipboard tool", () => {
    expect(clipboardCommand("freebsd")).toBeUndefined();
    expect(clipboardCommand("aix")).toBeUndefined();
  });
});

describe("readClipboardText — fail-loud on an unsupported platform", () => {
  it("rejects with a clear message rather than returning an empty string", async () => {
    await expect(readClipboardText("freebsd")).rejects.toThrow(/not supported on freebsd/u);
  });
});
