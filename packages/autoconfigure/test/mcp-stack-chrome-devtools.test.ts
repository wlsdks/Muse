import { CHROME_DEVTOOLS_MCP_SERVER_NAME } from "@muse/mcp";
import { describe, expect, it } from "vitest";

import { assembleMcpStack } from "../src/mcp-stack.js";
import type { MuseEnvironment } from "../src/index.js";

// Point MCP config at a missing file so loadExternalMcpConfig returns
// [] regardless of the test machine's ~/.muse/mcp.json.
const baseEnv = { MUSE_MCP_CONFIG: "/nonexistent/muse-mcp-stack-test.json" } as unknown as MuseEnvironment;

function chromeEntry(env: MuseEnvironment) {
  return assembleMcpStack(env, undefined).externalServerInputs.find((s) => s.name === CHROME_DEVTOOLS_MCP_SERVER_NAME);
}

describe("assembleMcpStack — turnkey chrome-devtools auto-registration", () => {
  it("auto-registers the chrome-devtools preset (auto-connect) when MUSE_CHROME_DEVTOOLS_ENABLED=true", () => {
    const cdt = chromeEntry({ ...baseEnv, MUSE_CHROME_DEVTOOLS_ENABLED: "true" } as MuseEnvironment);
    expect(cdt).toBeDefined();
    expect(cdt!.autoConnect).toBe(true);
    expect(cdt!.transportType).toBe("stdio");
    expect((cdt!.config as { command: string }).command).toBe("npx");
    expect((cdt!.config as { args: readonly string[] }).args).toEqual(
      expect.arrayContaining(["--browser-url", "http://127.0.0.1:9222"])
    );
  });

  it("honours MUSE_CHROME_DEVTOOLS_BROWSER_URL", () => {
    const cdt = chromeEntry({ ...baseEnv, MUSE_CHROME_DEVTOOLS_BROWSER_URL: "http://127.0.0.1:9333", MUSE_CHROME_DEVTOOLS_ENABLED: "true" } as MuseEnvironment);
    expect((cdt!.config as { args: readonly string[] }).args).toContain("http://127.0.0.1:9333");
  });

  it("does NOT register it by default (opt-in)", () => {
    expect(chromeEntry(baseEnv)).toBeUndefined();
  });
});
