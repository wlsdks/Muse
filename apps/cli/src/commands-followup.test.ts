import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFollowups, type PersistedFollowup } from "@muse/mcp";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { registerFollowupCommands } from "./commands-followup.js";

async function runFollowup(args: string[]): Promise<{ readonly error?: string; readonly stdout: string }> {
  const stdout: string[] = [];
  const io = { stderr: () => {}, stdout: (m: string) => stdout.push(m) };
  let error: string | undefined;
  try {
    const program = new Command();
    program.exitOverride();
    registerFollowupCommands(program, io);
    await program.parseAsync(["node", "muse", "followup", ...args]);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return { error, stdout: stdout.join("") };
}

describe("muse followup list — ordering by parsed instant, not lexicographic scheduledFor", () => {
  const prevEnv = process.env.MUSE_FOLLOWUPS_FILE;
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.MUSE_FOLLOWUPS_FILE;
    else process.env.MUSE_FOLLOWUPS_FILE = prevEnv;
  });
  function followup(overrides: Partial<PersistedFollowup>): PersistedFollowup {
    return {
      createdAt: "2026-05-22T00:00:00.000Z",
      id: "f",
      scheduledFor: "2026-05-22T12:00:00.000Z",
      status: "scheduled",
      summary: "x",
      userId: "stark",
      ...overrides
    };
  }

  it("lists a timezone-offset scheduledFor in real-instant order (a lexicographic sort would invert it)", async () => {
    const f = join(mkdtempSync(join(tmpdir(), "muse-followup-list-")), "followups.json");
    // a: 2026-05-22T23:00:00-05:00 == 2026-05-23T04:00:00Z (LATER instant)
    // b: 2026-05-23T01:00:00Z (EARLIER instant)
    // Lexicographically "2026-05-22T23…" < "2026-05-23T01…" → a sorts first; by instant b is first.
    await writeFollowups(f, [
      followup({ id: "a", scheduledFor: "2026-05-22T23:00:00-05:00", summary: "later" }),
      followup({ id: "b", scheduledFor: "2026-05-23T01:00:00Z", summary: "earlier" })
    ]);
    process.env.MUSE_FOLLOWUPS_FILE = f;
    const r = await runFollowup(["list", "--json"]);
    expect(r.error).toBeUndefined();
    const payload = JSON.parse(r.stdout) as { followups: { id: string }[] };
    expect(payload.followups.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});
