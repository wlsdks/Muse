import { describe, expect, it } from "vitest";

import {
  isPlanExecuteMode,
  renderPlanResultSummary,
  renderToolDescriptionsForPlanning,
  systemMessageContent
} from "../src/plan-execute.js";

describe("isPlanExecuteMode", () => {
  it("returns true when metadata.agentMode equals 'plan_execute' (case-insensitive)", () => {
    expect(isPlanExecuteMode({ agentMode: "plan_execute" })).toBe(true);
    expect(isPlanExecuteMode({ agentMode: "PLAN_EXECUTE" })).toBe(true);
  });

  it("returns false for any other agent mode or shape", () => {
    expect(isPlanExecuteMode(undefined)).toBe(false);
    expect(isPlanExecuteMode({})).toBe(false);
    expect(isPlanExecuteMode({ agentMode: "react" })).toBe(false);
    expect(isPlanExecuteMode({ agentMode: 123 })).toBe(false);
    expect(isPlanExecuteMode({ other: "plan_execute" })).toBe(false);
  });
});

describe("systemMessageContent", () => {
  it("returns the first system message content", () => {
    expect(
      systemMessageContent([
        { content: "you are jarvis", role: "system" },
        { content: "hello", role: "user" }
      ])
    ).toBe("you are jarvis");
  });

  it("returns undefined when no system message is present", () => {
    expect(
      systemMessageContent([
        { content: "hello", role: "user" },
        { content: "hi", role: "assistant" }
      ])
    ).toBeUndefined();
    expect(systemMessageContent([])).toBeUndefined();
  });
});

describe("renderToolDescriptionsForPlanning", () => {
  it("formats tools as bullet list preserving input order", () => {
    expect(
      renderToolDescriptionsForPlanning([
        { name: "alpha", description: "first tool", parameters: { type: "object" } },
        { name: "beta", description: "second tool", parameters: { type: "object" } }
      ])
    ).toBe("- alpha: first tool\n- beta: second tool");
  });

  it("returns an empty string when no tools are supplied", () => {
    expect(renderToolDescriptionsForPlanning([])).toBe("");
  });
});

describe("renderPlanResultSummary", () => {
  it("uses the success body when output is non-empty", () => {
    expect(
      renderPlanResultSummary([
        { tool: "search", description: "find docs", output: "found 3 hits", success: true }
      ])
    ).toBe("[search] find docs\nfound 3 hits");
  });

  it("emits the [데이터 없음] marker when output is empty", () => {
    expect(
      renderPlanResultSummary([
        { tool: "search", description: "find docs", output: "  ", success: true }
      ])
    ).toContain("[데이터 없음]");
    expect(
      renderPlanResultSummary([
        { tool: "search", description: "find docs", output: null, success: true }
      ])
    ).toContain("[데이터 없음]");
  });

  it("emits the [실패] marker when success is false, regardless of output", () => {
    expect(
      renderPlanResultSummary([
        { tool: "search", description: "find docs", output: "stale", success: false, error: "boom" }
      ])
    ).toContain("[실패]");
  });

  it("joins multiple steps with double newlines", () => {
    expect(
      renderPlanResultSummary([
        { tool: "a", description: "first", output: "ok-a", success: true },
        { tool: "b", description: "second", output: "ok-b", success: true }
      ])
    ).toBe("[a] first\nok-a\n\n[b] second\nok-b");
  });
});
