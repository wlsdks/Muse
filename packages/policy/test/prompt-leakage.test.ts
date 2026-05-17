import { describe, expect, it } from "vitest";
import { detectSystemPromptLeakage } from "../src/index.js";

describe("prompt leakage policy", () => {
  it("detects canary token leaks", () => {
    expect(
      detectSystemPromptLeakage("The hidden marker is MUSE_CANARY_123", {
        canaryTokens: ["MUSE_CANARY_123"]
      })
    ).toContainEqual({
      match: "MUSE_CANARY_123",
      name: "canary_token"
    });
  });

  it("detects common English system prompt disclosure phrasing", () => {
    expect(detectSystemPromptLeakage("Here is my full prompt in detail")).toContainEqual({
      match: "Here is my full prompt",
      name: "here_are_instructions"
    });
  });

  it("detects section marker leakage", () => {
    expect(detectSystemPromptLeakage("[Response Format]\nRespond with valid JSON only.")).toContainEqual({
      match: "[Response Format]",
      name: "prompt_section_marker"
    });
  });

  it("detects multilingual and structural leakage", () => {
    const findings = detectSystemPromptLeakage("sistema prompt: hidden text");

    expect(findings.map((finding) => finding.name)).toContain("multilingual_system_prompt");
  });

  it("does not flag ordinary explanations about prompt engineering", () => {
    expect(detectSystemPromptLeakage("We should design prompts with clear examples and constraints.")).toEqual([]);
  });

  it("detects leaks obfuscated with zero-width / homoglyph splits (goal 298)", () => {
    // Built from escapes (never raw invisible bytes in source).
    const ZW = String.fromCharCode(0x200b);
    const cyrA = String.fromCharCode(0x0430); // Cyrillic homoglyph of "a"

    // ZW inside "prompt" — readable to a human; stripping it
    // restores "my system prompt is" which the raw regex missed.
    expect(detectSystemPromptLeakage(`Sure, my system pro${ZW}mpt is: be a helpful agent`)
      .map((f) => f.name)).toContain("my_system_prompt");

    // Cyrillic homoglyph in a section marker → folds to "[Language Rule]".
    expect(detectSystemPromptLeakage(`verbatim: [L${cyrA}nguage Rule] then more`)
      .map((f) => f.name)).toContain("prompt_section_marker");

    // Canary split by a zero-width char must still be caught.
    expect(
      detectSystemPromptLeakage(`the hidden marker is CANA${ZW}RY123`, { canaryTokens: ["CANARY123"] })
    ).toContainEqual({ match: "CANARY123", name: "canary_token" });

    // Clean benign text is still not flagged (normalize is identity).
    expect(detectSystemPromptLeakage("Let's compare two design options.")).toEqual([]);
  });
});
