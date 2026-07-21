/**
 * `muse.reminders.list` mapped any `status` outside its enum to "pending"
 * and returned the pending list unchanged — status:'done' returned the
 * pending set, and the only tell was the echoed `status` field (a
 * corrected value is not a disclosure that the request changed). Mirrors
 * the `muse.tasks.list` fix (tool-calling.md rule 7): repair, but say so.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createRemindersMcpServer } from "../src/index.js";
import { writeReminders, type PersistedReminder } from "@muse/stores";

function freshFile(): string {
  return join(mkdtempSync(join(tmpdir(), "muse-rem-list-status-")), "reminders.json");
}

const reminder = (id: string, status: PersistedReminder["status"]): PersistedReminder => ({
  createdAt: "2026-07-01T00:00:00.000Z",
  dueAt: "2026-07-25T00:00:00.000Z",
  id,
  status,
  text: `reminder ${id}`,
  userId: "u"
});

function listTool(file: string) {
  const found = createRemindersMcpServer({ file }).tools.find((t) => t.name === "list");
  if (!found) throw new Error("muse.reminders list tool is missing");
  return found;
}

describe("muse.reminders.list never silently answers a different question", () => {
  it("discloses the repair when status is outside the enum", async () => {
    const file = freshFile();
    await writeReminders(file, [reminder("r1", "pending"), reminder("r2", "fired")]);
    const out = await listTool(file).execute({ status: "done" }) as { note?: string; status?: string; reminders?: unknown[] };
    expect(out.status).toBe("pending");
    expect(out.reminders).toHaveLength(1);
    expect(out.note).toContain("done");
    expect(out.note).toContain("pending");
  });

  it("stays SILENT when status is omitted — that default is the contract", async () => {
    const file = freshFile();
    await writeReminders(file, [reminder("r1", "pending")]);
    const out = await listTool(file).execute({}) as { note?: string; status?: string };
    expect(out.status).toBe("pending");
    expect(out.note).toBeUndefined();
  });

  it("stays silent for each valid enum value", async () => {
    const file = freshFile();
    await writeReminders(file, [reminder("r1", "pending"), reminder("r2", "fired")]);
    for (const status of ["pending", "fired", "all"]) {
      const out = await listTool(file).execute({ status }) as { note?: string; status?: string };
      expect(out.status, status).toBe(status);
      expect(out.note, status).toBeUndefined();
    }
  });
});
