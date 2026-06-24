import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getBackgroundProcess,
  registerBackgroundProcess,
  stopBackgroundProcess,
  type BackgroundProcessRecord
} from "../src/index.js";

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-bgstop-")), "processes.json");
}

const rec = (over: Partial<BackgroundProcessRecord>): BackgroundProcessRecord => ({
  id: "p", pid: 4242, command: "npm run dev", startedAt: "2026-06-24T00:00:00.000Z", status: "running", ...over
});

const now = () => new Date("2026-06-24T12:00:00.000Z");

describe("stopBackgroundProcess (X-3 slice 5c)", () => {
  it("signals the PID and marks the record killed", async () => {
    const file = tmpFile();
    await registerBackgroundProcess(file, rec({ id: "a", pid: 999 }));
    const killed: number[] = [];
    const result = await stopBackgroundProcess(file, "a", (pid) => killed.push(pid), now);
    expect(result).toBe("stopped");
    expect(killed).toEqual([999]);
    expect(await getBackgroundProcess(file, "a")).toMatchObject({ status: "killed", endedAt: "2026-06-24T12:00:00.000Z" });
  });

  it("still records terminal when the kill throws (process already dead)", async () => {
    const file = tmpFile();
    await registerBackgroundProcess(file, rec({ id: "a" }));
    const result = await stopBackgroundProcess(file, "a", () => { throw new Error("ESRCH"); }, now);
    expect(result).toBe("stopped");
    expect((await getBackgroundProcess(file, "a"))?.status).toBe("killed");
  });

  it("returns not_found for an unknown id (kill never called)", async () => {
    const file = tmpFile();
    let called = false;
    const result = await stopBackgroundProcess(file, "nope", () => { called = true; }, now);
    expect(result).toBe("not_found");
    expect(called).toBe(false);
  });

  it("returns already_done for a non-running record (kill never called)", async () => {
    const file = tmpFile();
    await registerBackgroundProcess(file, rec({ id: "a", status: "exited", exitCode: 0 }));
    let called = false;
    const result = await stopBackgroundProcess(file, "a", () => { called = true; }, now);
    expect(result).toBe("already_done");
    expect(called).toBe(false);
  });
});
