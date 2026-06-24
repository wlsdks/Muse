import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getBackgroundProcess,
  reconcileBackgroundProcesses,
  registerBackgroundProcess,
  type BackgroundProcessRecord
} from "../src/index.js";

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-bgrec-")), "processes.json");
}

const rec = (over: Partial<BackgroundProcessRecord>): BackgroundProcessRecord => ({
  id: "p", pid: 100, command: "x", startedAt: "2026-06-24T00:00:00.000Z", status: "running", ...over
});

const now = () => new Date("2026-06-24T09:00:00.000Z");

describe("reconcileBackgroundProcesses (X-3 slice 3 — crash recovery by PID)", () => {
  it("marks a running record whose PID is dead as exited", async () => {
    const file = tmpFile();
    await registerBackgroundProcess(file, rec({ id: "dead", pid: 100 }));
    const reconciled = await reconcileBackgroundProcesses(file, () => false, now);
    expect(reconciled).toEqual(["dead"]);
    expect(await getBackgroundProcess(file, "dead")).toMatchObject({ status: "exited", endedAt: "2026-06-24T09:00:00.000Z" });
  });

  it("leaves a running record whose PID is still alive untouched", async () => {
    const file = tmpFile();
    await registerBackgroundProcess(file, rec({ id: "live", pid: 200 }));
    const reconciled = await reconcileBackgroundProcesses(file, (pid) => pid === 200, now);
    expect(reconciled).toEqual([]);
    expect((await getBackgroundProcess(file, "live"))?.status).toBe("running");
  });

  it("does not touch already-terminal records", async () => {
    const file = tmpFile();
    await registerBackgroundProcess(file, rec({ id: "done", status: "exited", exitCode: 0 }));
    const reconciled = await reconcileBackgroundProcesses(file, () => false, now);
    expect(reconciled).toEqual([]);
    expect((await getBackgroundProcess(file, "done"))?.status).toBe("exited");
  });

  it("reconciles only the dead ones in a mixed registry", async () => {
    const file = tmpFile();
    await registerBackgroundProcess(file, rec({ id: "a", pid: 1 }));
    await registerBackgroundProcess(file, rec({ id: "b", pid: 2 }));
    const reconciled = await reconcileBackgroundProcesses(file, (pid) => pid === 2, now);
    expect(reconciled).toEqual(["a"]);
    expect((await getBackgroundProcess(file, "b"))?.status).toBe("running");
  });
});
