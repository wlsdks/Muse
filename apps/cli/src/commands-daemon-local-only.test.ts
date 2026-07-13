import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerDaemonCommands } from "./commands-daemon-register.js";

describe("muse daemon — T2-B1 local-only remote-provider absence", () => {
  it("rejects --status --provider telegram before any daemon tick when the local-only builder omits Telegram", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-daemon-local-only-"));
    const stderr: string[] = [];
    const stdout: string[] = [];
    const priorExit = process.exitCode;
    try {
      const env = {
        HOME: root,
        MUSE_DAEMON_CONFIG_FILE: join(root, "daemon.json"),
        MUSE_LOCAL_ONLY: "true",
        MUSE_MESSAGING_CREDENTIALS_FILE: join(root, "messaging.json"),
        MUSE_TELEGRAM_BOT_TOKEN: "telegram-token"
      } as NodeJS.ProcessEnv;
      const program = new Command();
      program.exitOverride();
      registerDaemonCommands(program, { stderr: (message) => stderr.push(message), stdout: (message) => stdout.push(message) }, { env: () => env });
      await program.parseAsync(["node", "muse", "daemon", "--status", "--provider", "telegram"], { from: "node" });

      expect(stderr.join("")).toContain("Provider 'telegram' is not registered");
      expect(stdout.join("")).not.toContain("readiness");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = priorExit;
      await rm(root, { force: true, recursive: true });
    }
  });
});
