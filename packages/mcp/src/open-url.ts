import { spawn } from "node:child_process";

/**
 * Resolve the launcher command + argv for opening `url` on `platform`, or
 * `null` to REFUSE.
 *
 * Two safety properties, because `url` can be attacker-controlled — it is the
 * OAuth `authorization_endpoint` a (malicious or compromised) MCP server hands
 * back during `muse mcp login`:
 *
 *  1. Only `http(s)` is launched. A `file:` / `javascript:` / other scheme is
 *     refused, so a hostile server cannot make the default handler open a local
 *     file or a script URL.
 *  2. The Windows path does NOT go through `cmd /c start`. `start` is a cmd
 *     builtin, so cmd RE-PARSES its arguments and a `&` / `|` / `%` in the URL
 *     injects commands even though spawn passed it as one argv element — and a
 *     real OAuth URL legitimately contains `&`, so it cannot simply be rejected.
 *     `rundll32 url.dll,FileProtocolHandler <url>` opens the URL in the default
 *     browser via CreateProcess with no shell re-parse: the URL stays one
 *     literal argument.
 */
export function browserOpenCommand(platform: NodeJS.Platform, url: string): readonly [string, readonly string[]] | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (platform === "darwin") {
    return ["open", [url]];
  }
  if (platform === "win32") {
    return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  }
  return ["xdg-open", [url]];
}

/**
 * Open a URL in the user's default browser, cross-platform. Detached + unref'd
 * so the CLI process isn't tied to the browser's lifetime; stdio ignored so a
 * launcher's chatter never pollutes the terminal. Best-effort — a failed or
 * refused spawn is swallowed because the login flow already prints the URL for
 * a manual paste. See {@link browserOpenCommand} for why the URL is validated
 * and Windows avoids `cmd /c start`.
 */
export function openUrlInDefaultBrowser(url: string): void {
  const resolved = browserOpenCommand(process.platform, url);
  if (resolved === null) {
    return; // non-http(s) or unparseable — refuse rather than launch
  }
  const [command, args] = resolved;
  try {
    const child = spawn(command, [...args], { detached: true, stdio: "ignore" });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // best-effort — the URL is printed for manual open
  }
}
