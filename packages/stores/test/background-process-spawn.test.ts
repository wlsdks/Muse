import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getBackgroundProcess,
  readBackgroundProcesses,
  spawnBackgroundProcess,
  type BackgroundSpawner,
  type SpawnedChild
} from "../src/index.js";

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-bgspawn-")), "processes.json");
}

class FakeChild implements SpawnedChild {
  pid = 1234;
  private listener?: (code: number | null) => void | Promise<void>;
  onExit(listener: (code: number | null) => void | Promise<void>): void {
    this.listener = listener;
  }
  async exit(code: number | null): Promise<void> {
    await this.listener?.(code);
  }
}

function fakeSpawner(child: FakeChild, captured?: { command?: string; logFile?: string }): BackgroundSpawner {
  return {
    spawn(command, options) {
      if (captured) {
        captured.command = command;
        captured.logFile = options.logFile;
      }
      return child;
    }
  };
}

const baseDeps = (file: string, child: FakeChild, over: Record<string, unknown> = {}) => ({
  storeFile: file,
  spawner: fakeSpawner(child),
  logFileFor: (id: string) => `/logs/${id}.log`,
  now: () => new Date("2026-06-24T00:00:00.000Z"),
  newId: () => "bg1",
  ...over
});

describe("spawnBackgroundProcess (X-3 slice 2)", () => {
  it("spawns and records a running process with pid + logFile", async () => {
    const file = tmpFile();
    const child = new FakeChild();
    const rec = await spawnBackgroundProcess("npm run dev", {}, baseDeps(file, child));
    expect(rec).toMatchObject({ id: "bg1", pid: 1234, command: "npm run dev", status: "running", logFile: "/logs/bg1.log" });
    expect(await readBackgroundProcesses(file)).toHaveLength(1);
  });

  it("REFUSES a command the injected guard flags, and records nothing", async () => {
    const file = tmpFile();
    const child = new FakeChild();
    await expect(
      spawnBackgroundProcess("rm -rf /", {}, baseDeps(file, child, { classifyDanger: () => "recursive delete of root" }))
    ).rejects.toThrow(/refused: recursive delete of root/);
    expect(await readBackgroundProcesses(file)).toEqual([]);
  });

  it("rejects an empty command", async () => {
    const file = tmpFile();
    await expect(spawnBackgroundProcess("   ", {}, baseDeps(file, new FakeChild()))).rejects.toThrow(/empty command/);
  });

  it("marks the record exited with code 0 on clean exit", async () => {
    const file = tmpFile();
    const child = new FakeChild();
    await spawnBackgroundProcess("npm test", {}, baseDeps(file, child));
    await child.exit(0);
    expect(await getBackgroundProcess(file, "bg1")).toMatchObject({ status: "exited", exitCode: 0, endedAt: "2026-06-24T00:00:00.000Z" });
  });

  it("marks the record failed on a non-zero exit", async () => {
    const file = tmpFile();
    const child = new FakeChild();
    await spawnBackgroundProcess("npm test", {}, baseDeps(file, child));
    await child.exit(1);
    expect((await getBackgroundProcess(file, "bg1"))?.status).toBe("failed");
  });

  it("passes the resolved logFile to the spawner", async () => {
    const file = tmpFile();
    const captured: { command?: string; logFile?: string } = {};
    const child = new FakeChild();
    await spawnBackgroundProcess("npm run dev", {}, { ...baseDeps(file, child), spawner: fakeSpawner(child, captured) });
    expect(captured.logFile).toBe("/logs/bg1.log");
  });
});
