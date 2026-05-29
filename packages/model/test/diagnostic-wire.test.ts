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
});
