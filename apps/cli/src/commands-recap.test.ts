import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendActionLog, writeTasks } from "@muse/mcp";
import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { composeEveningRecap, deliverEveningRecapIfDue, gatherEveningRecap, registerRecapCommand, shouldFireRecap, type EveningRecapInput } from "./commands-recap.js";
import type { ProgramIO } from "./program.js";

describe("composeEveningRecap — deterministic evening digest", () => {
  const base = (over: Partial<EveningRecapInput> = {}): EveningRecapInput => ({
    comingUp: [], now: new Date("2026-06-04T21:00:00"), openFollowups: 0, performedToday: [], sessionsToday: 0, slipping: [], ...over
  });

  it("renders the retrospective (actions + sessions), what's coming up, and open follow-ups", () => {
    const out = composeEveningRecap(base({
      comingUp: ["Call the dentist — due 9:00 AM"],
      openFollowups: 3,
      performedToday: ["Sent the standup notes via Telegram", "Locked the front door"],
      sessionsToday: 2
    }));
    expect(out).toContain("Evening recap");
    expect(out).toContain("Today you got done (2)");
    expect(out).toContain("✓ Sent the standup notes via Telegram");
    expect(out).toContain("2 sessions with Muse today");
    expect(out).toContain("Coming up");
    expect(out).toContain("Call the dentist");
    expect(out).toContain("3 open follow-ups");
  });

  it("a quiet day with nothing logged says so (no false 'you got done')", () => {
    const out = composeEveningRecap(base());
    expect(out).toContain("Quiet day — nothing logged yet");
    expect(out).not.toContain("got done");
  });

  it("caps the action list at 8 and notes the overflow", () => {
    const out = composeEveningRecap(base({ performedToday: Array.from({ length: 11 }, (_, i) => `action ${i.toString()}`) }));
    expect(out).toContain("Today you got done (11)");
    expect(out).toContain("…and 3 more");
  });

  it("surfaces SLIPPING items (overdue/missed) — the absence/anomaly signal", () => {
    const out = composeEveningRecap(base({ slipping: ["Pay rent — was due Jun 1", "Call dentist — was due Jun 3 2:00 PM"] }));
    expect(out).toContain("Slipping — expected by now, not done (2)");
    expect(out).toContain("⚠ Pay rent — was due Jun 1");
  });

  it("omits the Slipping section when nothing is overdue", () => {
    expect(composeEveningRecap(base({ performedToday: ["x"] }))).not.toContain("Slipping");
  });
});

describe("gatherEveningRecap — overdue detection (the absence signal)", () => {
  it("flags an OPEN task past its dueAt as slipping; ignores a future-due open task and a done task", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-recap-gather-"));
    const tasksFile = join(dir, "tasks.json");
    const now = new Date("2026-06-04T21:00:00");
    const past = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    const future = new Date(now.getTime() + 3 * 86_400_000).toISOString();
    await writeTasks(tasksFile, [
      { createdAt: past, dueAt: past, id: "t1", status: "open", title: "Pay rent" },
      { createdAt: past, dueAt: future, id: "t2", status: "open", title: "Future thing" },
      { completedAt: now.toISOString(), createdAt: past, dueAt: past, id: "t3", status: "done", title: "Done thing" }
    ]);
    const env: Record<string, string | undefined> = {
      MUSE_ACTION_LOG_FILE: join(dir, "a.json"),
      MUSE_EPISODES_FILE: join(dir, "e.json"),
      MUSE_FOLLOWUPS_FILE: join(dir, "f.json"),
      MUSE_REMINDERS_FILE: join(dir, "r.json"),
      MUSE_TASKS_FILE: tasksFile
    };
    const input = await gatherEveningRecap(env, now);
    expect(input.slipping.some((s) => s.includes("Pay rent"))).toBe(true);
    expect(input.slipping.some((s) => s.includes("Future thing"))).toBe(false);
    expect(input.slipping.some((s) => s.includes("Done thing"))).toBe(false);
  });
});

describe("muse recap — wired command over the real stores (fail-soft)", () => {
  const prev = { ...process.env };
  afterEach(() => { process.env = { ...prev }; });

  async function run(): Promise<string> {
    const out: string[] = [];
    const io: ProgramIO = { stderr: (m: string) => out.push(m), stdout: (m: string) => out.push(m) };
    const program = new Command();
    program.exitOverride();
    registerRecapCommand(program, io);
    await program.parseAsync(["node", "muse", "recap"]);
    return out.join("");
  }

  it("surfaces a performed action from today's action log in the digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-recap-"));
    process.env.MUSE_ACTION_LOG_FILE = join(dir, "action-log.json");
    process.env.MUSE_EPISODES_FILE = join(dir, "episodes.json");
    process.env.MUSE_REMINDERS_FILE = join(dir, "reminders.json");
    process.env.MUSE_FOLLOWUPS_FILE = join(dir, "followups.json");
    await appendActionLog(process.env.MUSE_ACTION_LOG_FILE, {
      detail: "",
      id: "a1",
      result: "performed",
      userId: "u",
      what: "Booked the Q3 review room",
      when: new Date().toISOString(),
      why: "objective"
    });
    const out = await run();
    expect(out).toContain("Evening recap");
    expect(out).toContain("✓ Booked the Q3 review room");
  });
});

describe("shouldFireRecap — once-a-day evening gate (pure)", () => {
  const evening = new Date("2026-06-04T21:30:00");
  it("does NOT fire before the evening hour", () => {
    expect(shouldFireRecap(new Date("2026-06-04T15:00:00"), undefined, 21)).toBe(false);
  });
  it("fires past the hour when it has never fired", () => {
    expect(shouldFireRecap(evening, undefined, 21)).toBe(true);
  });
  it("does NOT fire a second time the same day", () => {
    expect(shouldFireRecap(evening, "2026-06-04T21:05:00", 21)).toBe(false);
  });
  it("fires again the next day", () => {
    expect(shouldFireRecap(evening, "2026-06-03T21:05:00", 21)).toBe(true);
  });
  it("treats a garbage last-fired timestamp as not-fired (fires)", () => {
    expect(shouldFireRecap(evening, "not-a-date", 21)).toBe(true);
  });
});

describe("deliverEveningRecapIfDue — proactive fire + dedup (pure deps)", () => {
  const sampleInput: EveningRecapInput = {
    comingUp: [], now: new Date("2026-06-04T21:30:00"), openFollowups: 0, performedToday: ["did a thing"], sessionsToday: 1, slipping: []
  };
  it("fires when due: composes, sends, and records the fire", async () => {
    const sent: string[] = [];
    let recorded = false;
    const outcome = await deliverEveningRecapIfDue({
      now: new Date("2026-06-04T21:30:00"), recapHour: 21, lastFiredISO: undefined,
      gather: async () => sampleInput, send: async (t) => { sent.push(t); }, recordFired: () => { recorded = true; }
    });
    expect(outcome).toBe("fired");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("did a thing");
    expect(recorded).toBe(true);
  });
  it("does NOT fire before the hour (no send, no record)", async () => {
    const sent: string[] = [];
    let recorded = false;
    const outcome = await deliverEveningRecapIfDue({
      now: new Date("2026-06-04T15:00:00"), recapHour: 21, lastFiredISO: undefined,
      gather: async () => sampleInput, send: async (t) => { sent.push(t); }, recordFired: () => { recorded = true; }
    });
    expect(outcome).toBe("not-due");
    expect(sent).toHaveLength(0);
    expect(recorded).toBe(false);
  });
  it("does NOT re-fire when already fired today (dedup)", async () => {
    let sent = 0;
    const outcome = await deliverEveningRecapIfDue({
      now: new Date("2026-06-04T22:00:00"), recapHour: 21, lastFiredISO: "2026-06-04T21:05:00",
      gather: async () => sampleInput, send: async () => { sent += 1; }, recordFired: () => {}
    });
    expect(outcome).toBe("not-due");
    expect(sent).toBe(0);
  });
});
