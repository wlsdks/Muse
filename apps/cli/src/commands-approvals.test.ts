import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { recordPendingApproval, type PendingApproval } from "@muse/messaging";
import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerApprovalsCommands } from "./commands-approvals.js";

async function run(file: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io = { stderr: (m: string) => stderr.push(m), stdout: (m: string) => stdout.push(m) };
  const prev = process.env.MUSE_PENDING_APPROVALS_FILE;
  process.env.MUSE_PENDING_APPROVALS_FILE = file;
  let exitCode: number | undefined;
  try {
    const program = new Command();
    program.exitOverride();
    registerApprovalsCommands(program, io);
    await program.parseAsync(["node", "muse", "approvals", ...args]);
  } catch (cause) {
    exitCode = (cause as { exitCode?: number }).exitCode ?? 1;
  } finally {
    if (prev === undefined) delete process.env.MUSE_PENDING_APPROVALS_FILE;
    else process.env.MUSE_PENDING_APPROVALS_FILE = prev;
  }
  return { exitCode, stderr: stderr.join(""), stdout: stdout.join("") };
}

function file(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-cli-approvals-")), "pending-approvals.json");
}

function entry(overrides: Partial<PendingApproval> = {}): PendingApproval {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    arguments: { subject: "Q3", to: "bob" },
    createdAt: new Date().toISOString(),
    draft: 'to bob, subject "Q3"',
    expiresAt: future,
    id: "p1",
    providerId: "telegram",
    risk: "execute",
    source: "42",
    tool: "email_send",
    ...overrides
  };
}

describe("muse approvals", () => {
  it("lists un-expired pending approvals (default subcommand), newest first", async () => {
    const f = file();
    await recordPendingApproval(f, entry({ id: "old", createdAt: "2026-05-22T10:00:00.000Z" }));
    await recordPendingApproval(f, entry({ id: "new", createdAt: "2026-05-22T10:05:00.000Z" }));
    const r = await run(f, []);
    expect(r.stdout.indexOf("new")).toBeLessThan(r.stdout.indexOf("old"));
    expect(r.stdout).toContain("email_send");
    expect(r.stdout).toContain('to bob, subject "Q3"');
  });

  it("empty worklist → friendly message", async () => {
    expect((await run(file(), [])).stdout).toBe("No pending approvals.\n");
  });

  it("hides an expired entry from the list", async () => {
    const f = file();
    await recordPendingApproval(f, entry({ id: "stale", expiresAt: "2020-01-01T00:00:00.000Z" }));
    expect((await run(f, [])).stdout).toBe("No pending approvals.\n");
  });

  it("clear <id> dismisses a pending approval; unknown id exits 1", async () => {
    const f = file();
    await recordPendingApproval(f, entry({ id: "abc" }));
    const ok = await run(f, ["clear", "abc"]);
    expect(ok.stdout).toContain("Dismissed pending approval abc");
    expect((await run(f, [])).stdout).toBe("No pending approvals.\n");
    const miss = await run(f, ["clear", "ghost"]);
    expect(miss.stderr).toContain("No pending approval with id 'ghost'");
    expect(miss.exitCode).toBe(1);
  });

  it("--json emits a machine-readable envelope", async () => {
    const f = file();
    await recordPendingApproval(f, entry({ id: "j1" }));
    const r = await run(f, ["list", "--json"]);
    const payload = JSON.parse(r.stdout) as { total: number; pending: PendingApproval[] };
    expect(payload.total).toBe(1);
    expect(payload.pending[0]?.id).toBe("j1");
  });
});
