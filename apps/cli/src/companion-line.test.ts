import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MUSE_IDENTITY_CORE, SURFACE_ROLES } from "@muse/prompts";
import { writeReminders } from "@muse/stores";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyCompanionVoice,
  buildFunPool,
  buildGreetings,
  companionPersona,
  gatherCompanionCandidates,
  isContentFreeLine,
  phraseCandidate,
  phrasingIsGrounded,
  selectCompanionLine,
  selectMode,
  timeGreeting,
  type CompanionCandidate,
  type CompanionMode
} from "./companion-line.js";

const cand = (key: string, over: Partial<CompanionCandidate> = {}): CompanionCandidate => ({
  fields: over.fields ?? { title: key },
  key,
  kind: over.kind ?? "task",
  line: over.line ?? `line for ${key}`,
  topic: over.topic ?? key
});

const emptyFun = { joke: buildFunPool("joke", "en"), musing: buildFunPool("musing", "en"), tease: buildFunPool("tease", "en") };
const noVeto = new Set<string>();

describe("selectMode — weighted rotation, no-immediate-repeat, quiet gating", () => {
  it("removes proactive from the wheel when it isn't allowed (quiet / no grounded)", () => {
    for (let r = 0; r < 24; r += 1) {
      expect(selectMode({ allowProactive: false, recentModes: [], rotation: r })).not.toBe("proactive");
    }
  });

  it("weights grounded+greeting primary and fun as a ~25% sprinkle over the wheel", () => {
    const counts: Record<string, number> = {};
    for (let r = 0; r < 12; r += 1) {
      const m = selectMode({ allowProactive: true, recentModes: [], rotation: r });
      counts[m] = (counts[m] ?? 0) + 1;
    }
    expect(counts.proactive).toBe(5);
    expect(counts.greeting).toBe(4);
    const fun = (counts.joke ?? 0) + (counts.tease ?? 0) + (counts.musing ?? 0);
    expect(fun).toBe(3); // 3/12 = 25%
  });

  it("never immediately repeats the last mode", () => {
    let last: CompanionMode | undefined;
    for (let r = 0; r < 40; r += 1) {
      const m = selectMode({ allowProactive: true, recentModes: last ? [last] : [], rotation: r });
      expect(m).not.toBe(last);
      last = m;
    }
  });
});

describe("selectCompanionLine — mode-driven opener selection", () => {
  const greetings = ["Good morning ☀️", "What's on your mind?", "I'm right here :)"];

  it("returns a grounded proactive line on a rotation whose mode is proactive", () => {
    const s = selectCompanionLine({
      candidates: [cand("reminder:r1", { line: "line for reminder:r1" })],
      funPools: emptyFun,
      greetings,
      quiet: false,
      recent: [],
      recentModes: [],
      rotation: 0, // wheel[0] = proactive
      vetoed: noVeto
    });
    expect(s.mode).toBe("proactive");
    expect(s.grounded).toBe(true);
    expect(s.key).toBe("reminder:r1");
    expect(s.topic).toBe("reminder:r1");
  });

  it("never selects proactive during QUIET HOURS — a content-free mode instead", () => {
    const s = selectCompanionLine({
      candidates: [cand("reminder:r1"), cand("task:t1")],
      funPools: emptyFun,
      greetings,
      quiet: true,
      recent: [],
      recentModes: [],
      rotation: 0,
      vetoed: noVeto
    });
    expect(s.mode).not.toBe("proactive");
    expect(s.grounded).toBe(false);
    expect(s.topic).toBe("");
  });

  it("suppresses a VETOED grounded source (drops it from the fresh set)", () => {
    // Only candidate is vetoed → proactive isn't allowed → content-free mode.
    const s = selectCompanionLine({
      candidates: [cand("calendar:evt-42")],
      funPools: emptyFun,
      greetings,
      quiet: false,
      recent: [],
      recentModes: [],
      rotation: 0,
      vetoed: new Set(["calendar:evt-42"])
    });
    expect(s.grounded).toBe(false);
    expect(s.key).not.toBe("calendar:evt-42");
  });

  it("a recently-shown grounded key is not fresh → proactive not offered on it", () => {
    const s = selectCompanionLine({
      candidates: [cand("reminder:r1")],
      funPools: emptyFun,
      greetings,
      quiet: false,
      recent: ["reminder:r1"],
      recentModes: [],
      rotation: 0,
      vetoed: noVeto
    });
    expect(s.grounded).toBe(false);
  });
});

describe("phrasingIsGrounded — the hard fabrication gate on model re-phrasing", () => {
  const facts = ["14:30", "Q3 sync"];

  it("accepts a faithful rephrase that only uses the facts", () => {
    expect(phrasingIsGrounded('Ready for "Q3 sync" at 14:30?', facts)).toBe(true);
  });

  it("REJECTS a phrasing that invents a number absent from the facts", () => {
    expect(phrasingIsGrounded('You have 3 meetings before "Q3 sync"', facts)).toBe(false);
  });

  it("REJECTS a phrasing that invents a different time", () => {
    expect(phrasingIsGrounded('"Q3 sync" is at 15:45', facts)).toBe(false);
  });

  it("REJECTS a phrasing that invents a quoted entity not in the facts", () => {
    expect(phrasingIsGrounded('Also "Budget review" is coming up', facts)).toBe(false);
  });

  it("rejects an over-long line or a leaked refusal", () => {
    expect(phrasingIsGrounded("x".repeat(200), facts)).toBe(false);
    expect(phrasingIsGrounded("I'm not sure about that", facts)).toBe(false);
  });

  it("the internal `overdue` flag is NOT phrasing evidence — an invented count is rejected", () => {
    const candidate = cand("reminder:r1", { fields: { overdue: 1, text: "submit the Q3 memo" }, kind: "reminder", line: 'Still pending: "submit the Q3 memo"' });
    const plan = selectCompanionLine({
      candidates: [candidate],
      funPools: emptyFun,
      greetings: ["hi"],
      quiet: false,
      recent: [],
      recentModes: [],
      rotation: 0,
      vetoed: noVeto
    });
    // facts must exclude the overdue flag, so "1" is not an allowed number.
    expect(plan.facts).not.toContain("1");
    expect(phrasingIsGrounded("You have 1 item overdue: submit the Q3 memo", plan.facts)).toBe(false);
  });
});

describe("isContentFreeLine — the guard on greeting/joke/tease/musing", () => {
  it("accepts a short, digit-free, kind quip", () => {
    expect(isContentFreeLine("커피는 원래 답이죠 ☕")).toBe(true);
    expect(isContentFreeLine("Coffee is always the answer ☕")).toBe(true);
  });

  it("REJECTS any line carrying a digit (it could smuggle a user-fact claim)", () => {
    expect(isContentFreeLine("You have 3 meetings today")).toBe(false);
  });

  it("rejects empty, over-long, or refusal lines", () => {
    expect(isContentFreeLine("   ")).toBe(false);
    expect(isContentFreeLine("x".repeat(120))).toBe(false);
    expect(isContentFreeLine("잘 모르겠어요")).toBe(false);
  });
});

describe("buildFunPool / companionPersona — content-free, on-persona fun", () => {
  it("every canned quip is content-free (no digits) and short, in both languages", () => {
    for (const lang of ["ko", "en"] as const) {
      for (const mode of ["joke", "tease", "musing"] as const) {
        for (const q of buildFunPool(mode, lang)) {
          expect(isContentFreeLine(q)).toBe(true);
        }
      }
    }
  });

  it("the persona is a single consistent voice string per language", () => {
    expect(companionPersona("ko")).toContain("파랑새");
    expect(companionPersona("en").toLowerCase()).toContain("bluebird");
  });

  it("composes through the seam: identity-core at position 0, then the lang persona, then the companion role", () => {
    for (const lang of ["ko", "en"] as const) {
      const prompt = companionPersona(lang);
      expect(prompt.startsWith(MUSE_IDENTITY_CORE)).toBe(true);
      expect(prompt).toContain(SURFACE_ROLES.companion);
      expect(prompt.indexOf(SURFACE_ROLES.companion)).toBeGreaterThan(prompt.indexOf(MUSE_IDENTITY_CORE));
    }
  });
});

describe("applyCompanionVoice — model layer, fail-soft to the deterministic line", () => {
  const lang = "en" as const;

  it("swaps in a grounded rephrase that passes the post-check", async () => {
    const plan = selectCompanionLine({
      candidates: [cand("event:e1", { fields: { time: "14:30", title: "Q3 sync" }, kind: "event", line: 'Next up: "Q3 sync" at 14:30' })],
      funPools: emptyFun,
      greetings: ["hi"],
      quiet: false,
      recent: [],
      recentModes: [],
      rotation: 0,
      vetoed: noVeto
    });
    const line = await applyCompanionVoice(plan, lang, { phrase: async () => '"Q3 sync" is coming up at 14:30 — ready?' });
    expect(line).toBe('"Q3 sync" is coming up at 14:30 — ready?');
  });

  it("FALLS BACK to the deterministic template when the rephrase fabricates a datum", async () => {
    const plan = selectCompanionLine({
      candidates: [cand("event:e1", { fields: { time: "14:30", title: "Q3 sync" }, kind: "event", line: 'Next up: "Q3 sync" at 14:30' })],
      funPools: emptyFun,
      greetings: ["hi"],
      quiet: false,
      recent: [],
      recentModes: [],
      rotation: 0,
      vetoed: noVeto
    });
    const line = await applyCompanionVoice(plan, lang, { phrase: async () => 'You have 5 meetings before "Q3 sync"' });
    expect(line).toBe('Next up: "Q3 sync" at 14:30'); // template stands
  });

  it("keeps a model quip only if content-free, else the canned pool line", async () => {
    const plan = selectCompanionLine({
      candidates: [],
      funPools: emptyFun,
      greetings: ["hi"],
      quiet: false,
      recent: [],
      recentModes: ["greeting"],
      rotation: 1, // no candidates ⇒ proactive-less wheel; index 1 = joke
      vetoed: noVeto
    });
    expect(plan.mode).toBe("joke");
    const good = await applyCompanionVoice(plan, lang, { gen: async () => "I almost sneezed a feather 🪶" });
    expect(good).toBe("I almost sneezed a feather 🪶");
    const bad = await applyCompanionVoice(plan, lang, { gen: async () => "You have 2 tasks left" });
    expect(bad).toBe(plan.line); // canned pool line, not the fabricating quip
  });
});

describe("phraseCandidate — deterministic, honest phrasing from real fields", () => {
  it("interpolates the real event title + time (ko + en)", () => {
    expect(phraseCandidate("event", { time: "14:30", title: "Q3 sync" }, "en", 0)).toContain("Q3 sync");
    expect(phraseCandidate("event", { time: "14:30", title: "Q3 sync" }, "en", 0)).toContain("14:30");
    expect(phraseCandidate("event", { time: "14:30", title: "회의" }, "ko", 0)).toContain("회의");
  });

  it("varies the phrasing template as rotation advances", () => {
    const a = phraseCandidate("task", { overdue: 0, title: "Pay rent" }, "en", 0);
    const b = phraseCandidate("task", { overdue: 0, title: "Pay rent" }, "en", 1);
    expect(a).not.toBe(b);
    expect(a).toContain("Pay rent");
    expect(b).toContain("Pay rent");
  });

  it("distinguishes overdue from upcoming without inventing anything", () => {
    expect(phraseCandidate("reminder", { overdue: 1, text: "call mom" }, "en", 0).toLowerCase()).toContain("overdue");
    expect(phraseCandidate("reminder", { overdue: 0, text: "call mom" }, "en", 0).toLowerCase()).not.toContain("overdue");
  });

  it("phrases a birthday only from the given name + day count", () => {
    expect(phraseCandidate("birthday", { days: 0, name: "Sarah" }, "en", 0)).toContain("Sarah");
    expect(phraseCandidate("birthday", { days: 3, name: "Sarah" }, "en", 0)).toContain("3 days");
  });

  it("truncates an overlong field so the line fits the bubble", () => {
    const long = "x".repeat(200);
    const line = phraseCandidate("note", { title: long }, "en", 0);
    expect(line.length).toBeLessThan(80);
    expect(line).toContain("…");
  });
});

describe("timeGreeting / buildGreetings — content-free, asserts nothing", () => {
  it("buckets by hour and localizes", () => {
    expect(timeGreeting("en", 8)).toBe("Good morning ☀️");
    expect(timeGreeting("en", 14)).toContain("afternoon");
    expect(timeGreeting("en", 20)).toContain("evening");
    expect(timeGreeting("ko", 8)).toContain("아침");
  });

  it("greeting pool leads with the time greeting and never mentions a data fact", () => {
    const greetings = buildGreetings("en", 8);
    expect(greetings[0]).toBe("Good morning ☀️");
    expect(greetings.length).toBeGreaterThan(3);
    for (const g of greetings) {
      expect(g).not.toMatch(/\d/u); // no counts / times / dates in a content-free greeting
    }
  });
});

describe("gatherCompanionCandidates — grounded extraction + fabrication guard", () => {
  let dir: string;
  const now = new Date("2026-07-08T09:00:00Z");

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const seededEnv = (overrides: Record<string, string>): NodeJS.ProcessEnv => ({
    MUSE_NOTES_DIR: join(dir, "empty-notes"),
    ...overrides
  });

  it("extracts a due reminder as a grounded candidate carrying its store fields + topic", async () => {
    dir = await mkdtemp(join(tmpdir(), "companion-"));
    const remindersFile = join(dir, "reminders.json");
    await writeReminders(remindersFile, [
      { createdAt: now.toISOString(), dueAt: new Date(now.getTime() + 3_600_000).toISOString(), id: "rem-1", status: "pending", text: "submit the Q3 memo" }
    ]);
    const candidates = await gatherCompanionCandidates(
      seededEnv({ MUSE_REMINDERS_FILE: remindersFile }),
      now,
      "en",
      0
    );
    const reminder = candidates.find((c) => c.key === "reminder:rem-1");
    expect(reminder).toBeDefined();
    expect(reminder!.line).toContain("submit the Q3 memo");
    expect(reminder!.topic).toBe("submit the Q3 memo");
    expect(reminder!.fields).toMatchObject({ text: "submit the Q3 memo" });
  });

  it("FABRICATION GUARD: empty stores yield ZERO candidates — nothing to invent", async () => {
    dir = await mkdtemp(join(tmpdir(), "companion-empty-"));
    const candidates = await gatherCompanionCandidates(
      seededEnv({
        MUSE_CALENDAR_FILE: join(dir, "no-calendar.json"),
        MUSE_CHECKINS_FILE: join(dir, "no-checkins.json"),
        MUSE_CONTACTS_FILE: join(dir, "no-contacts.json"),
        MUSE_FOLLOWUPS_FILE: join(dir, "no-followups.json"),
        MUSE_REMINDERS_FILE: join(dir, "no-reminders.json"),
        MUSE_TASKS_FILE: join(dir, "no-tasks.json")
      }),
      now,
      "en",
      0
    );
    expect(candidates).toEqual([]);

    // …and with no candidates, proactive is never selected — a content-free
    // mode with no digits and no topic, never an invented event/count.
    const s = selectCompanionLine({
      candidates,
      funPools: emptyFun,
      greetings: buildGreetings("en", now.getHours()),
      quiet: false,
      recent: [],
      recentModes: [],
      rotation: 0,
      vetoed: new Set<string>()
    });
    expect(s.grounded).toBe(false);
    expect(s.mode).not.toBe("proactive");
    expect(s.topic).toBe("");
  });

  it("does not surface a task whose due date is far in the future", async () => {
    dir = await mkdtemp(join(tmpdir(), "companion-task-"));
    const tasksFile = join(dir, "tasks.json");
    const far = new Date(now.getTime() + 10 * 86_400_000).toISOString();
    await writeFile(tasksFile, JSON.stringify({ tasks: [{ dueAt: far, id: "t-far", status: "open", title: "distant task" }] }), "utf8");
    const candidates = await gatherCompanionCandidates(
      seededEnv({ MUSE_TASKS_FILE: tasksFile }),
      now,
      "en",
      0
    );
    expect(candidates.find((c) => c.key === "task:t-far")).toBeUndefined();
  });
});
