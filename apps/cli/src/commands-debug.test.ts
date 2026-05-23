import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerDebugCommands, type DebugCommandHelpers } from "./commands-debug.js";

function harness(): { run: (args: string[]) => Promise<unknown>; requests: { path: string }[] } {
  const requests: { path: string }[] = [];
  const io = { stderr: () => { /* no-op */ }, stdout: () => { /* no-op */ } };
  const helpers: DebugCommandHelpers = {
    apiRequest: async (_io, _command, path) => {
      requests.push({ path });
      return { ok: true };
    },
    writeOutput: () => { /* no-op */ }
  };
  const program = new Command();
  program.exitOverride();
  registerDebugCommands(program, io as never, helpers);
  return { requests, run: (args) => program.parseAsync(["node", "muse", "debug", ...args]) };
}

describe("muse debug replay — validates --limit instead of forwarding it raw", () => {
  it("rejects a non-numeric --limit WITHOUT issuing the request", async () => {
    const h = harness();
    await expect(h.run(["replay", "--limit", "lots"])).rejects.toThrow(/--limit must be an integer in \[1, 1000\]/u);
    expect(h.requests).toHaveLength(0);
  });

  it("clamps an over-max --limit to 1000", async () => {
    const h = harness();
    await h.run(["replay", "--limit", "50000"]);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]!.path).toBe("/api/admin/debug/replay?limit=1000");
  });

  it("forwards a valid --limit and omits the query when unset", async () => {
    const valid = harness();
    await valid.run(["replay", "--limit", "10"]);
    expect(valid.requests[0]!.path).toBe("/api/admin/debug/replay?limit=10");

    const none = harness();
    await none.run(["replay"]);
    expect(none.requests[0]!.path).toBe("/api/admin/debug/replay");
  });
});
