import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runDueObjectives, type ObjectiveEvaluation } from "./objective-evaluation-loop.js";
import { addObjective, readObjectives, type StandingObjective } from "./personal-objectives-store.js";

function tmpFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "muse-obj-eval-"));
  return join(dir, "objectives.json");
}

function objective(overrides: Partial<StandingObjective> = {}): StandingObjective {
  return {
    createdAt: "2026-05-18T10:00:00.000Z",
    id: "obj_1",
    kind: "until",
    spec: "watch the CI build until it goes green, then tell me",
    status: "active",
    userId: "stark",
    ...overrides
  };
}

const T0 = new Date("2026-05-18T12:00:00.000Z");

describe("runDueObjectives — P5-b2 tick re-evaluation with backoff / escalation", () => {
  it("condition flips → action fires once and the objective is durably marked done", async () => {
    const file = tmpFile();
    await addObjective(file, objective());
    const acted: string[] = [];

    // First tick: condition not yet true → backoff, no action.
    const t1 = await runDueObjectives({
      act: async (o) => {
        acted.push(o.id);
      },
      evaluate: async (): Promise<ObjectiveEvaluation> => ({ outcome: "unmet" }),
      file,
      now: () => T0
    });
    expect(t1).toMatchObject({ due: 1, fired: [], retried: ["obj_1"] });
    expect(acted).toEqual([]);
    const afterUnmet = (await readObjectives(file))[0]!;
    expect(afterUnmet.status).toBe("active");
    expect(afterUnmet.attempts).toBe(1);
    expect(Date.parse(afterUnmet.nextEvalAt!)).toBeGreaterThan(T0.getTime());

    // Later tick (past the backoff window): condition now holds.
    const later = new Date(Date.parse(afterUnmet.nextEvalAt!) + 1000);
    const t2 = await runDueObjectives({
      act: async (o) => {
        acted.push(o.id);
      },
      evaluate: async (): Promise<ObjectiveEvaluation> => ({ outcome: "met" }),
      file,
      now: () => later
    });
    expect(t2).toMatchObject({ due: 1, fired: ["obj_1"] });
    expect(acted).toEqual(["obj_1"]);
    const done = (await readObjectives(file))[0]!;
    expect(done.status).toBe("done");
    expect(done.resolution).toBe("condition met");
  });

  it("unmet → exponential backoff: nextEvalAt grows with attempts and the objective is not due before it", async () => {
    const file = tmpFile();
    await addObjective(file, objective());
    const base = 1000;

    await runDueObjectives({
      act: async () => {},
      backoffBaseMs: base,
      evaluate: async (): Promise<ObjectiveEvaluation> => ({ outcome: "unmet" }),
      file,
      now: () => T0
    });
    const a1 = (await readObjectives(file))[0]!;
    expect(Date.parse(a1.nextEvalAt!)).toBe(T0.getTime() + base); // 2^0

    // Still inside the backoff window → not due, evaluate never called.
    let evaluated = false;
    const skip = await runDueObjectives({
      act: async () => {},
      evaluate: async (): Promise<ObjectiveEvaluation> => {
        evaluated = true;
        return { outcome: "unmet" };
      },
      file,
      now: () => new Date(T0.getTime() + base - 1)
    });
    expect(skip.due).toBe(0);
    expect(evaluated).toBe(false);

    // Past the window, unmet again → attempts=2, delay doubles (2^1).
    const t2 = new Date(T0.getTime() + base);
    await runDueObjectives({
      act: async () => {},
      backoffBaseMs: base,
      evaluate: async (): Promise<ObjectiveEvaluation> => ({ outcome: "unmet" }),
      file,
      now: () => t2
    });
    const a2 = (await readObjectives(file))[0]!;
    expect(a2.attempts).toBe(2);
    expect(Date.parse(a2.nextEvalAt!)).toBe(t2.getTime() + base * 2);
  });

  it("unmeetable → durably escalated (never silently dropped) and the escalate sink is notified", async () => {
    const file = tmpFile();
    await addObjective(file, objective());
    const escalations: { id: string; reason: string }[] = [];

    const summary = await runDueObjectives({
      act: async () => {},
      escalate: async (o, reason) => {
        escalations.push({ id: o.id, reason });
      },
      evaluate: async (): Promise<ObjectiveEvaluation> => ({ outcome: "unmeetable", reason: "watched repo was deleted" }),
      file,
      now: () => T0
    });

    expect(summary.escalated).toEqual(["obj_1"]);
    expect(escalations).toEqual([{ id: "obj_1", reason: "watched repo was deleted" }]);
    const esc = (await readObjectives(file))[0]!;
    expect(esc.status).toBe("escalated");
    expect(esc.resolution).toBe("watched repo was deleted");
  });

  it("unmet too many times → escalates instead of retrying forever", async () => {
    const file = tmpFile();
    await addObjective(file, objective({ attempts: 1 }));
    const summary = await runDueObjectives({
      act: async () => {},
      evaluate: async (): Promise<ObjectiveEvaluation> => ({ outcome: "unmet" }),
      file,
      maxAttempts: 2,
      now: () => T0
    });
    expect(summary.escalated).toEqual(["obj_1"]);
    const esc = (await readObjectives(file))[0]!;
    expect(esc.status).toBe("escalated");
    expect(esc.resolution).toContain("attempts exhausted");
  });

  it("fail-open: a throwing evaluator records an error, leaves the objective active, never crashes the loop", async () => {
    const file = tmpFile();
    await addObjective(file, objective());
    const summary = await runDueObjectives({
      act: async () => {},
      evaluate: async () => {
        throw new Error("condition source unreachable");
      },
      file,
      now: () => T0
    });
    expect(summary.errors).toEqual(["obj_1: condition source unreachable"]);
    const still = (await readObjectives(file))[0]!;
    expect(still.status).toBe("active");
    expect(still.attempts).toBeUndefined();
  });

  it("does not act/done when act() throws — the objective stays active for a later tick", async () => {
    const file = tmpFile();
    await addObjective(file, objective());
    const summary = await runDueObjectives({
      act: async () => {
        throw new Error("messenger down");
      },
      evaluate: async (): Promise<ObjectiveEvaluation> => ({ outcome: "met" }),
      file,
      now: () => T0
    });
    expect(summary.fired).toEqual([]);
    expect(summary.errors).toEqual(["obj_1: messenger down"]);
    expect((await readObjectives(file))[0]!.status).toBe("active");
  });
});
