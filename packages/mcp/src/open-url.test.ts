/**
 * The URL passed to the browser launcher is the OAuth `authorization_endpoint`
 * a remote MCP server returns during `muse mcp login` — attacker-controlled if
 * the server is malicious or later compromised. The old Windows path ran
 * `cmd /c start "" <url>`, and because `start` is a cmd builtin, cmd re-parsed
 * its arguments: a `&` / `|` / `%` in the URL injected commands even though
 * spawn passed the URL as one argv element.
 *
 * Two properties are pinned: a non-http(s) scheme is refused (no `file:` /
 * `javascript:` launch), and the Windows launcher never routes through cmd, so
 * an OAuth URL that legitimately contains `&` is passed as a single literal
 * argument to a program that does not re-parse it.
 */

import { describe, expect, it } from "vitest";

import { browserOpenCommand } from "./open-url.js";

describe("browserOpenCommand", () => {
  it("refuses a non-http(s) scheme on every platform", () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      expect(browserOpenCommand(platform, "file:///etc/passwd"), platform).toBeNull();
      expect(browserOpenCommand(platform, "javascript:alert(1)"), platform).toBeNull();
      expect(browserOpenCommand(platform, "not a url"), platform).toBeNull();
    }
  });

  it("never routes a Windows launch through cmd / start (which re-parses metacharacters)", () => {
    const resolved = browserOpenCommand("win32", "https://idp.example/oauth?client_id=x&state=y");
    expect(resolved).not.toBeNull();
    const [command, args] = resolved!;
    expect(command).not.toBe("cmd");
    expect(args).not.toContain("start");
    // The URL — including its `&` — is a single, un-split argv element handed to
    // a launcher that opens it via CreateProcess, not a shell.
    expect(args[args.length - 1]).toBe("https://idp.example/oauth?client_id=x&state=y");
  });

  it("passes a URL with cmd metacharacters through as ONE literal argument", () => {
    // If this ever went through cmd, the `& calc` would be a command separator.
    const injected = "https://evil.example/path?a=1&calc";
    const resolved = browserOpenCommand("win32", injected);
    expect(resolved).not.toBeNull();
    const [, args] = resolved!;
    expect(args).toContainEqual(injected); // exactly one element equals the whole URL
    expect(args.some((a) => a === "calc")).toBe(false);
  });

  it("uses the platform-native opener for macOS and Linux http(s)", () => {
    expect(browserOpenCommand("darwin", "https://ok.example/x")).toEqual(["open", ["https://ok.example/x"]]);
    expect(browserOpenCommand("linux", "https://ok.example/x")).toEqual(["xdg-open", ["https://ok.example/x"]]);
  });
});
