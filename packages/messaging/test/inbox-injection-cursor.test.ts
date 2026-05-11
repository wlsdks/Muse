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
});
