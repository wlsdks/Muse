import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FileAgentTaskBoard, readBoard, writeBoard } from "../src/board-store.js";
import { addTask } from "../src/task-board.js";

let dir = "";
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "muse-board-")); });
afterAll(async () => { await rm(dir, { force: true, recursive: true }); });
const freshFile = () => join(dir, `board-${randomUUID()}.json`);

describe("FileAgentTaskBoard — durable persistence (S2)", () => {
  it("a missing file reads as an empty board (never throws)", async () => {
    expect(await readBoard(join(dir, "ghost.json"))).toEqual([]);
  });
  it("round-trips: persisted tasks load back identically", async () => {
    const file = freshFile();
    const board = addTask([], { id: "a", title: "ship S2" }, "2026-06-28T00:00:00Z");
    await writeBoard(file, board);
    expect((await readBoard(file)).map((t) => t.id)).toEqual(["a"]);
    expect(JSON.parse(await readFile(file, "utf8")).tasks).toHaveLength(1);
  });
  it("mutate applies a pure transform AND persists it (the read-modify-write seam)", async () => {
    const store = new FileAgentTaskBoard(freshFile());
    await store.mutate((tasks) => addTask(tasks, { id: "a", title: "first" }, "t0"));
    const after = await store.mutate((tasks) => addTask(tasks, { id: "b", dependsOn: ["a"], title: "second" }, "t1"));
    expect(after.map((t) => t.id)).toEqual(["a", "b"]);
    expect((await new FileAgentTaskBoard((store as unknown as { file: string }).file).list()).map((t) => t.id)).toEqual(["a", "b"]); // survived a fresh handle
  });
  it("a corrupt file reads as empty, not a crash", async () => {
    const file = freshFile();
    await writeBoard(file, addTask([], { id: "a", title: "x" }, "t0"));
    await (await import("node:fs/promises")).writeFile(file, "{ not json");
    expect(await readBoard(file)).toEqual([]);
  });
});

import { defaultBoardFile } from "../src/board-store.js";

describe("defaultBoardFile", () => {
  it("honors MUSE_BOARD_FILE; else falls back to a ~/.muse path", () => {
    expect(defaultBoardFile({ MUSE_BOARD_FILE: "/tmp/x/board.json" } as NodeJS.ProcessEnv)).toBe("/tmp/x/board.json");
    expect(defaultBoardFile({} as NodeJS.ProcessEnv)).toMatch(/\.muse[/\\]agent-board\.json$/u);
  });
});
