import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CalendarProviderRegistry } from "@muse/calendar";
import { MessagingProviderRegistry } from "@muse/messaging";
import { writeFollowups, type PersistedFollowup } from "@muse/stores";
import { describe, expect, it } from "vitest";

import { buildLoopbackTools, type LoopbackToolsDeps } from "../src/loopback-tools.js";

// `muse.tasks.list` / `muse.reminders.list` both cap their default page via
// an env var (MUSE_TASKS_LIST_MAX / MUSE_REMINDERS_LIST_MAX); followups had
// no such cap wired, so a full followups store serialized entirely into one
// tool result. MUSE_FOLLOWUPS_LIST_MAX closes that gap for parity.

const dir = mkdtempSync(join(tmpdir(), "muse-loopback-followups-max-"));
const path = (name: string): string => join(dir, name);

const baseDeps = (over: Partial<LoopbackToolsDeps> = {}): LoopbackToolsDeps => ({
  actionLogFile: path("action-log.json"),
  calendarRegistry: new CalendarProviderRegistry([]),
  env: {} as LoopbackToolsDeps["env"],
  episodesFile: path("episodes.json"),
  followupsFile: path("followups.json"),
  messagingRegistry: new MessagingProviderRegistry([]),
  notesDir: path("notes"),
  notesRegistry: undefined,
  patternsFiredFile: path("patterns.json"),
  pollAll: undefined,
  pollNow: undefined,
  proactiveHistoryFile: path("proactive.json"),
  reminderHistoryFile: path("reminder-history.json"),
  remindersFile: path("reminders.json"),
  tasksFile: path("tasks.json"),
  tasksRegistry: undefined,
  userId: "u1",
  ...over
});

const makeFollowup = (id: string): PersistedFollowup => ({
  createdAt: new Date().toISOString(),
  id,
  scheduledFor: new Date(Date.now() + 60_000).toISOString(),
  status: "scheduled",
  summary: `check in #${id}`,
  userId: "u1"
});

describe("buildLoopbackTools — MUSE_FOLLOWUPS_LIST_MAX wiring", () => {
  it("defaults the followups list page to 12, mirroring tasks/reminders", async () => {
    const followupsFile = path("followups-default.json");
    await writeFollowups(followupsFile, Array.from({ length: 20 }, (_unused, i) => makeFollowup(`f${i.toString()}`)));
    const bundle = buildLoopbackTools(baseDeps({ followupsFile }));
    const listTool = bundle.followups.find((t) => t.definition.name === "muse.followup.list")!;
    const out = await listTool.execute({}, { runId: "r-1" }) as { shown: number; total: number };
    expect(out.shown).toBe(12);
    expect(out.total).toBe(20);
  });

  it("honors an explicit MUSE_FOLLOWUPS_LIST_MAX override", async () => {
    const followupsFile = path("followups-override.json");
    await writeFollowups(followupsFile, Array.from({ length: 20 }, (_unused, i) => makeFollowup(`f${i.toString()}`)));
    const bundle = buildLoopbackTools(baseDeps({
      env: { MUSE_FOLLOWUPS_LIST_MAX: "3" } as LoopbackToolsDeps["env"],
      followupsFile
    }));
    const listTool = bundle.followups.find((t) => t.definition.name === "muse.followup.list")!;
    const out = await listTool.execute({}, { runId: "r-1" }) as { shown: number; total: number };
    expect(out.shown).toBe(3);
    expect(out.total).toBe(20);
  });
});
