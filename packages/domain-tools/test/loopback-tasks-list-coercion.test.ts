/**
 * `muse.tasks.list` used to answer a `dueWithinDays: "7"` (stringified
 * number) or `tag: 123` (non-string) call with the plain unfiltered open
 * listing — byte-identical to a call with neither argument — because the
 * strict `typeof === "number"` / `typeof === "string"` checks treated
 * anything else as absent rather than as a value to repair. A stringified
 * number is a common small-model output shape, so both are now coerced
 * when unambiguous, and dueWithinDays STILL disclosed via `note` when it
 * truly can't be used (tool-calling.md rule 7).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTasksMcpServer } from "../src/index.js";

const ctx = { runId: "r", userId: "u" };

describe("muse.tasks.list coerces stringified/mistyped filter args instead of silently ignoring them", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "muse-tasks-coercion-"));
    file = join(dir, "tasks.json");
    writeFileSync(file, JSON.stringify({
      tasks: [
        { createdAt: "2026-07-01T00:00:00.000Z", dueAt: "2026-07-22T00:00:00.000Z", id: "task_1", status: "open", tags: ["123"], title: "Due soon, tagged 123" },
        { createdAt: "2026-07-01T00:00:00.000Z", id: "task_2", status: "open", title: "No due date, untagged" }
      ]
    }));
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  const listTool = () => {
    const tool = createTasksMcpServer({ file, now: () => new Date("2026-07-21T00:00:00.000Z") }).tools.find((entry) => entry.name === "list");
    if (!tool) throw new Error("muse.tasks list tool is missing");
    return tool;
  };

  it("coerces a numeric-STRING dueWithinDays ('7') and echoes the applied number", async () => {
    const out = await listTool().execute({ dueWithinDays: "7" }, ctx) as { dueWithinDays?: number; note?: string; tasks?: unknown[] };
    expect(out.dueWithinDays).toBe(7);
    expect(out.tasks).toHaveLength(1);
    expect(out.note).toBeUndefined();
  });

  it("coerces a NUMBER tag (123) via String() and still matches the string tag '123'", async () => {
    const out = await listTool().execute({ tag: 123 }, ctx) as { tag?: string; tasks?: { id: string }[] };
    expect(out.tag).toBe("123");
    expect(out.tasks?.map((t) => t.id)).toEqual(["task_1"]);
  });

  it("discloses and falls back to status listing when dueWithinDays cannot be parsed as a number", async () => {
    const out = await listTool().execute({ dueWithinDays: "this week" }, ctx) as { note?: string; status?: string; tasks?: unknown[] };
    expect(out.status).toBe("open");
    expect(out.note).toContain("this week");
    expect(out.note).toContain("dueWithinDays");
    expect(out.tasks).toHaveLength(2); // fell back to the unfiltered open listing
  });
});
