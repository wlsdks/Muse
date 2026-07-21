/**
 * Two silent-answer defects in `muse.followup.list`:
 *
 *  1. `total` was the POST-slice count (`sorted.length`), so a store with
 *     more entries than `maxListEntries` reported `total` equal to the
 *     page size — indistinguishable from "that's everything" when it
 *     wasn't. `total` is now the full filtered count; `shown` is the
 *     returned count and `truncated` says whether more exist.
 *  2. A `status` outside the enum silently fell back to "scheduled" with
 *     no disclosure — "did you follow up on that?" (status: 'done') got
 *     the scheduled list back reported as fact. Repair, but say so
 *     (tool-calling.md rule 7).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFollowupsMcpServer } from "../src/index.js";
import { writeFollowups, type PersistedFollowup } from "@muse/stores";

describe("muse.followup.list — total/shown/truncated + status disclosure", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-followups-list-"));
    file = join(dir, "followups.json");
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  function makeFollowup(id: string, offsetMinutes: number): PersistedFollowup {
    return {
      createdAt: new Date().toISOString(),
      id,
      scheduledFor: new Date(Date.now() + offsetMinutes * 60_000).toISOString(),
      status: "scheduled",
      summary: `check in #${id}`,
      userId: "default"
    };
  }

  const listTool = (maxListEntries?: number) =>
    createFollowupsMcpServer({ file, ...(maxListEntries !== undefined ? { maxListEntries } : {}) }).tools.find((t) => t.name === "list")!;

  it("reports total = the full filtered count, not the post-slice page size, and flags truncation", async () => {
    await writeFollowups(file, Array.from({ length: 5 }, (_unused, i) => makeFollowup(`f${i.toString()}`, i)));
    const out = await listTool(2).execute({}) as { followups: unknown[]; shown: number; total: number; truncated: boolean };
    expect(out.followups).toHaveLength(2);
    expect(out.shown).toBe(2);
    expect(out.total).toBe(5); // the real store size — was 2 (page size) before the fix
    expect(out.truncated).toBe(true);
  });

  it("truncated is false when everything fits", async () => {
    await writeFollowups(file, [makeFollowup("f0", 1)]);
    const out = await listTool(200).execute({}) as { total: number; truncated: boolean };
    expect(out.total).toBe(1);
    expect(out.truncated).toBe(false);
  });

  it("discloses the repair when status is outside the enum", async () => {
    await writeFollowups(file, [makeFollowup("f0", 1)]);
    const out = await listTool().execute({ status: "done" }) as { note?: string; status?: string };
    expect(out.status).toBe("scheduled");
    expect(out.note).toContain("done");
    expect(out.note).toContain("scheduled");
  });

  it("stays SILENT when status is omitted — that default is the contract", async () => {
    await writeFollowups(file, [makeFollowup("f0", 1)]);
    const out = await listTool().execute({}) as { note?: string; status?: string };
    expect(out.status).toBe("scheduled");
    expect(out.note).toBeUndefined();
  });

  it("honors an explicit `limit` capped by the server's maxListEntries", async () => {
    await writeFollowups(file, Array.from({ length: 5 }, (_unused, i) => makeFollowup(`f${i.toString()}`, i)));
    const out = await listTool(200).execute({ limit: 3 }) as { followups: unknown[]; shown: number; total: number };
    expect(out.followups).toHaveLength(3);
    expect(out.shown).toBe(3);
    expect(out.total).toBe(5);
  });
});
