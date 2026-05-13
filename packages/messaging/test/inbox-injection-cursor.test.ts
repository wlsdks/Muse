import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  advanceInboxInjectionCursor,
  readInboxInjectionCursor,
  writeInboxInjectionCursor
} from "../src/inbox-injection-cursor.js";

let workdir: string;
let cursorFile: string;

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), "muse-inbox-cursor-"));
  cursorFile = join(workdir, "slack-cursor.json");
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

describe("inbox-injection-cursor", () => {
  it("read returns empty when file is missing", async () => {
    expect(await readInboxInjectionCursor(cursorFile)).toEqual({});
  });

  it("write then read round-trips", async () => {
    await writeInboxInjectionCursor(cursorFile, { C1: "2026-05-11T08:00:00.000Z" });
    expect(await readInboxInjectionCursor(cursorFile)).toEqual({ C1: "2026-05-11T08:00:00.000Z" });
  });

  it("advance keeps newest ISO per source", async () => {
    await writeInboxInjectionCursor(cursorFile, {
      C1: "2026-05-11T08:00:00.000Z",
      C2: "2026-05-11T07:00:00.000Z"
    });
    const merged = await advanceInboxInjectionCursor(cursorFile, {
      C1: "2026-05-11T07:30:00.000Z", // older — should not overwrite
      C2: "2026-05-11T09:00:00.000Z", // newer — wins
      C3: "2026-05-11T06:00:00.000Z" // new source
    });
    expect(merged).toEqual({
      C1: "2026-05-11T08:00:00.000Z",
      C2: "2026-05-11T09:00:00.000Z",
      C3: "2026-05-11T06:00:00.000Z"
    });
  });

  it("isolates per-user cursors so user A's seen state doesn't shadow user B's", async () => {
    await writeInboxInjectionCursor(cursorFile, { C1: "2026-05-11T08:00:00.000Z" }, "alice");
    await writeInboxInjectionCursor(cursorFile, { C1: "2026-05-11T09:00:00.000Z" }, "bob");

    expect(await readInboxInjectionCursor(cursorFile, "alice")).toEqual({
      C1: "2026-05-11T08:00:00.000Z"
    });
    expect(await readInboxInjectionCursor(cursorFile, "bob")).toEqual({
      C1: "2026-05-11T09:00:00.000Z"
    });
    // Single-user (no userId) cursor is independent of both.
    expect(await readInboxInjectionCursor(cursorFile)).toEqual({});
  });

  it("migrates a v1 (flat) cursor file into the _global slot transparently", async () => {
    const { promises: fs } = await import("node:fs");
    await fs.writeFile(
      cursorFile,
      JSON.stringify({ lastInjectedAt: { C1: "2026-05-11T07:00:00.000Z" }, version: 1 }, null, 2),
      "utf8"
    );
    // Single-user read sees the migrated v1 entry.
    expect(await readInboxInjectionCursor(cursorFile)).toEqual({
      C1: "2026-05-11T07:00:00.000Z"
    });
    // A new user's read does NOT inherit it.
    expect(await readInboxInjectionCursor(cursorFile, "alice")).toEqual({});
  });

  it("advance for one user preserves other users' cursors", async () => {
    await writeInboxInjectionCursor(cursorFile, { C1: "2026-05-11T08:00:00.000Z" }, "alice");
    await advanceInboxInjectionCursor(cursorFile, { C1: "2026-05-11T10:00:00.000Z" }, "bob");

    expect(await readInboxInjectionCursor(cursorFile, "alice")).toEqual({
      C1: "2026-05-11T08:00:00.000Z"
    });
    expect(await readInboxInjectionCursor(cursorFile, "bob")).toEqual({
      C1: "2026-05-11T10:00:00.000Z"
    });
  });
});
