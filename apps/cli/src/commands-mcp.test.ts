import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { MCP_PRESETS, registerMcpCommands } from "./commands-mcp.js";

describe("registerMcpCommands — serve subcommand", () => {
  it("registers 'muse mcp serve' with consent-bearing help text", () => {
    const program = new Command("muse");
    registerMcpCommands(program, { stderr: () => undefined, stdout: () => undefined }, {
      apiRequest: async () => undefined,
      writeOutput: () => undefined
    });
    const mcp = program.commands.find((command) => command.name() === "mcp");
    const serve = mcp?.commands.find((command) => command.name() === "serve");
    expect(serve).toBeDefined();
    expect(serve?.description()).toMatch(/explicit consent/iu);
    expect(serve?.description()).toMatch(/muse_recall/u);
  });
});

describe("mcp config commands — local static files only", () => {
  it("config-show, config-doctor, config-add, and use never call the API", async () => {
    const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "muse-mcp-config-local-"));
    const configPath = join(root, "mcp.json");
    const previous = process.env.MUSE_MCP_CONFIG;
    const output: string[] = [];
    let apiCalls = 0;

    function createProgram(): Command {
      const program = new Command("muse");
      program.exitOverride();
      registerMcpCommands(program, {
        stderr: (line) => output.push(`stderr:${line}`),
        stdout: (line) => output.push(`stdout:${line}`)
      }, {
        apiRequest: async () => { apiCalls += 1; return undefined; },
        writeOutput: () => undefined
      });
      return program;
    }

    try {
      writeFileSync(configPath, JSON.stringify({
        mcpServers: { existing: { command: "node", args: ["server.mjs"] } }
      }), "utf8");
      process.env.MUSE_MCP_CONFIG = configPath;

      await createProgram().parseAsync(["node", "muse", "mcp", "config-show", "--json"]);
      await createProgram().parseAsync(["node", "muse", "mcp", "config-doctor", "--json"]);
      await createProgram().parseAsync(["node", "muse", "mcp", "config-add", "added", "--command", "node", "--arg", "added.mjs"]);
      await createProgram().parseAsync(["node", "muse", "mcp", "use", "fetch", "--name", "fetch-local"]);

      const parsed = JSON.parse(readFileSync(configPath, "utf8")) as { mcpServers: Record<string, unknown> };
      expect(parsed.mcpServers).toHaveProperty("existing");
      expect(parsed.mcpServers).toHaveProperty("added");
      expect(parsed.mcpServers).toHaveProperty("fetch-local");
      expect(apiCalls).toBe(0);
      expect(output.join("\n")).toContain(configPath);
    } finally {
      if (previous === undefined) delete process.env.MUSE_MCP_CONFIG;
      else process.env.MUSE_MCP_CONFIG = previous;
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("mcp add/call --config/--args — invalid JSON is a clean user error, not a bug", () => {
  it("`mcp add --config '{'` throws a clean fix-it Error and never calls the API", async () => {
    let apiCalls = 0;
    const program = new Command("muse");
    program.exitOverride();
    registerMcpCommands(program, { stderr: () => undefined, stdout: () => undefined }, {
      apiRequest: async () => { apiCalls += 1; return undefined; },
      writeOutput: () => undefined
    });
    await expect(
      program.parseAsync(["node", "muse", "mcp", "add", "foo", "--transport", "stdio", "--config", "{"])
    ).rejects.toThrow(/invalid JSON for --config: \{ — pass valid JSON/u);
    expect(apiCalls).toBe(0);
  });

  it("`mcp call --args 'notjson'` throws a clean fix-it Error and never calls the API", async () => {
    let apiCalls = 0;
    const program = new Command("muse");
    program.exitOverride();
    registerMcpCommands(program, { stderr: () => undefined, stdout: () => undefined }, {
      apiRequest: async () => { apiCalls += 1; return undefined; },
      writeOutput: () => undefined
    });
    await expect(
      program.parseAsync(["node", "muse", "mcp", "call", "srv", "tool", "--args", "notjson"])
    ).rejects.toThrow(/invalid JSON for --args: notjson — pass valid JSON/u);
    expect(apiCalls).toBe(0);
  });

  it("a valid --config JSON object still reaches the API", async () => {
    let apiCalls = 0;
    const program = new Command("muse");
    program.exitOverride();
    registerMcpCommands(program, { stderr: () => undefined, stdout: () => undefined }, {
      apiRequest: async () => { apiCalls += 1; return undefined; },
      writeOutput: () => undefined
    });
    await program.parseAsync(["node", "muse", "mcp", "add", "foo", "--transport", "stdio", "--config", "{\"command\":\"echo\"}"]);
    expect(apiCalls).toBe(1);
  });
});

describe("MCP_PRESETS.filesystem.build — refuses to default to filesystem root", () => {
  function withEnv(home: string | undefined, fn: () => void): void {
    const prev = process.env.HOME;
    if (home === undefined) delete process.env.HOME;
    else process.env.HOME = home;
    try { fn(); } finally {
      if (prev === undefined) delete process.env.HOME;
      else process.env.HOME = prev;
    }
  }

  it("uses --root verbatim when provided (trimmed)", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({ root: "/custom/path" });
      expect(entry.args?.[2]).toBe("/custom/path");
      expect(entry.description).toContain("/custom/path");
    });
  });

  it("trims a padded --root", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({ root: "  /padded  " });
      expect(entry.args?.[2]).toBe("/padded");
    });
  });

  it("falls back to HOME when --root is undefined", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({});
      expect(entry.args?.[2]).toBe("/u/jinan");
    });
  });

  it("falls back to HOME when --root is whitespace-only", () => {
    withEnv("/u/jinan", () => {
      const entry = MCP_PRESETS.filesystem!.build({ root: "   " });
      expect(entry.args?.[2]).toBe("/u/jinan");
    });
  });

  it("THROWS when both --root and HOME are empty — refuses to silently mount the MCP filesystem server at '/'", () => {
    withEnv("", () => {
      expect(() => MCP_PRESETS.filesystem!.build({})).toThrow(/--root <dir> is required.*refusing to default to filesystem root/u);
      expect(() => MCP_PRESETS.filesystem!.build({ root: "  " })).toThrow(/--root <dir> is required/u);
    });
  });

  it("THROWS when --root is undefined AND HOME is undefined (the original '? ?? \"/\"' silent-mount-at-root path)", () => {
    withEnv(undefined, () => {
      expect(() => MCP_PRESETS.filesystem!.build({})).toThrow(/--root <dir> is required/u);
    });
  });
});
