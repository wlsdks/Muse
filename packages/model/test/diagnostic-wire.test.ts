import { describe, expect, it } from "vitest";

import {
  diagnosticModelCapabilities,
  estimateDiagnosticTokens,
  renderDiagnosticOutput,
} from "../src/provider-wire.js";

describe("diagnosticModelCapabilities", () => {
  it("declares the diagnostic provider's fixed capability contract", () => {
    expect(diagnosticModelCapabilities()).toMatchObject({
      local: true,
      maxInputTokens: 32_000,
      maxOutputTokens: 4_096,
      structuredOutput: true,
      toolCalling: false,
    });
  });
});

describe("estimateDiagnosticTokens", () => {
  it("approximates ceil(chars / 4) with a floor of 1", () => {
    expect(estimateDiagnosticTokens("")).toBe(1); // floor, never 0
    expect(estimateDiagnosticTokens("abcd")).toBe(1);
    expect(estimateDiagnosticTokens("abcde")).toBe(2); // 5/4 rounds up
    expect(estimateDiagnosticTokens("a".repeat(40))).toBe(10);
  });

  it("counts UTF-16 code units (an astral char is length 2 → still ≥1)", () => {
    expect(estimateDiagnosticTokens("🙂")).toBe(1);
  });
});

describe("renderDiagnosticOutput", () => {
  const planningPrompt = (tools: string) => `[Role] planner\n[Output Format] JSON plan\n[Available Tools]\n${tools}`;

  it("echoes the user prompt when there is no system message or it is not a planning prompt", () => {
    expect(renderDiagnosticOutput([], "hello")).toBe("Diagnostic response: hello");
    expect(renderDiagnosticOutput([{ role: "system", content: "You are helpful" }], "hello")).toBe(
      "Diagnostic response: hello",
    );
  });

  it("trims trailing whitespace from the echoed prompt", () => {
    expect(renderDiagnosticOutput([], "hello   ")).toBe("Diagnostic response: hello");
  });

  it("emits an empty JSON plan for a planning prompt that does not list time_now", () => {
    expect(renderDiagnosticOutput([{ role: "system", content: planningPrompt("- other_tool: does things") }], "q")).toBe(
      "[]",
    );
  });

  it("emits a one-step time_now plan when the planning prompt lists that tool", () => {
    const out = renderDiagnosticOutput([{ role: "system", content: planningPrompt("- time_now: current time") }], "q");
    expect(JSON.parse(out)).toEqual([
      { args: {}, description: "Diagnostic plan-execute step (time_now)", tool: "time_now" },
    ]);
  });

  it("keys off the FIRST system message, not a later one", () => {
    const out = renderDiagnosticOutput(
      [
        { role: "user", content: "u" },
        { role: "system", content: "plain, not a planning prompt" },
        { role: "system", content: planningPrompt("- time_now: t") },
      ],
      "q",
    );
    expect(out).toBe("Diagnostic response: q");
  });

  // Steering directive (agent-eval gap B/C keystone): a `DIAGNOSTIC_PLAN=[…]`
  // trailing segment makes the diagnostic emit an arbitrary plan verbatim, so a
  // terminal-state / trajectory eval can drive the FULL plan-execute assembly
  // against a (state-mutating) tool with no real LLM. The directive must remain
  // INERT outside planning mode and fall through cleanly when malformed.
  describe("steering directive", () => {
    const sys = planningPrompt("- note_write: writes\n- time_now: now");
    const msgs = (s: string) => [{ role: "system", content: s }];
    const directive = (steps: unknown) =>
      `please do it\n\nDIAGNOSTIC_PLAN=${JSON.stringify(steps)}`;

    it("emits exactly the directed steps in a planning prompt", () => {
      const steps = [{ tool: "note_write", args: { id: "n1", text: "hi" }, description: "write" }];
      expect(JSON.parse(renderDiagnosticOutput(msgs(sys), directive(steps)))).toEqual(steps);
    });

    it("emits a multi-step directed plan verbatim (order preserved)", () => {
      const steps = [
        { tool: "note_write", args: { id: "a" }, description: "one" },
        { tool: "note_write", args: { id: "b" }, description: "two" },
      ];
      expect(JSON.parse(renderDiagnosticOutput(msgs(sys), directive(steps)))).toEqual(steps);
    });

    it("does NOT filter unavailable tools (validatePlan in the assembly rejects them, not us)", () => {
      const steps = [{ tool: "not_listed_tool", args: {}, description: "x" }];
      expect(JSON.parse(renderDiagnosticOutput(msgs(sys), directive(steps)))).toEqual(steps);
    });

    it("falls through to the legacy time_now plan when the directive JSON is malformed", () => {
      const out = renderDiagnosticOutput(msgs(sys), "x\n\nDIAGNOSTIC_PLAN=[not valid json");
      expect(JSON.parse(out)).toEqual([
        { args: {}, description: "Diagnostic plan-execute step (time_now)", tool: "time_now" },
      ]);
    });

    it("falls through when an entry is not a well-formed step (empty tool name)", () => {
      const out = renderDiagnosticOutput(msgs(sys), directive([{ tool: "", args: {}, description: "d" }]));
      expect(JSON.parse(out)).toEqual([
        { args: {}, description: "Diagnostic plan-execute step (time_now)", tool: "time_now" },
      ]);
    });

    it("rejects an args that is an array (must be an object map)", () => {
      const out = renderDiagnosticOutput(msgs(sys), `x DIAGNOSTIC_PLAN=[{"tool":"t","args":[],"description":"d"}]`);
      expect(JSON.parse(out)).toMatchObject([{ tool: "time_now" }]);
    });

    it("is INERT outside a planning prompt — the marker stays in the echoed text", () => {
      const text = "remember DIAGNOSTIC_PLAN=[{\"tool\":\"t\",\"args\":{},\"description\":\"d\"}]";
      expect(renderDiagnosticOutput(msgs("you are muse"), text)).toBe(`Diagnostic response: ${text}`);
    });

    it("uses the LAST marker occurrence so trailing directive wins", () => {
      const steps = [{ tool: "note_write", args: { k: "v" }, description: "real" }];
      const prompt = `noise DIAGNOSTIC_PLAN=ignored ... DIAGNOSTIC_PLAN=${JSON.stringify(steps)}`;
      expect(JSON.parse(renderDiagnosticOutput(msgs(sys), prompt))).toEqual(steps);
    });
  });
});
