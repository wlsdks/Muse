import { describe, expect, it } from "vitest";

import type { TaskState } from "../src/index.js";
import {
  TaskMemoryQualityError,
  assertTaskMemoryQuality,
  evaluateTaskMemoryQuality,
} from "../src/memory-task-store.js";

const valid: TaskState = { taskId: "t1", sessionId: "s1", goal: "investigate parity" };
const codes = (state: TaskState) => evaluateTaskMemoryQuality(state).issues.map((i) => i.code);

describe("evaluateTaskMemoryQuality", () => {
  it("passes a structurally valid task with no issues", () => {
    expect(evaluateTaskMemoryQuality(valid)).toEqual({ ok: true, issues: [], summary: { errorCount: 0, warningCount: 0 } });
  });

  it("flags each blank required field as a separate error and reports ok=false", () => {
    const report = evaluateTaskMemoryQuality({ taskId: "", sessionId: "   ", goal: "" });
    expect(report.ok).toBe(false);
    expect(report.summary.errorCount).toBe(3);
    expect(report.issues.map((i) => i.code)).toEqual(["missing_task_id", "missing_session_id", "missing_goal"]);
  });

  it("flags blank plan steps, decision summaries, and blocker descriptions as errors", () => {
    expect(codes({ ...valid, plan: [{ step: "  " }] })).toEqual(["empty_plan_step"]);
    expect(codes({ ...valid, decisions: [{ summary: "" }] })).toEqual(["empty_decision_summary"]);
    expect(codes({ ...valid, blockers: [{ description: " " }] })).toEqual(["empty_blocker_description"]);
  });

  it("warns (without failing) on a blocked task with no blockers", () => {
    const report = evaluateTaskMemoryQuality({ ...valid, status: "blocked", blockers: [] });
    expect(report).toMatchObject({ ok: true, summary: { errorCount: 0, warningCount: 1 } });
    expect(codes({ ...valid, status: "blocked", blockers: [] })).toEqual(["blocked_without_blocker"]);
  });

  it("warns (without failing) on a completed task lacking decisions or plan evidence", () => {
    expect(evaluateTaskMemoryQuality({ ...valid, status: "completed" })).toMatchObject({
      ok: true,
      summary: { warningCount: 1 },
    });
    expect(codes({ ...valid, status: "completed", plan: [{ step: "done it" }] })).toEqual([]);
  });
});

describe("assertTaskMemoryQuality", () => {
  it("does not throw for a valid state", () => {
    expect(() => assertTaskMemoryQuality(valid)).not.toThrow();
  });

  it("throws TaskMemoryQualityError when there is any error-severity issue", () => {
    expect(() => assertTaskMemoryQuality({ taskId: "", sessionId: "s1", goal: "g" })).toThrow(TaskMemoryQualityError);
  });

  it("does not throw on warning-only reports (warnings never block)", () => {
    expect(() => assertTaskMemoryQuality({ ...valid, status: "blocked", blockers: [] })).not.toThrow();
  });
});
