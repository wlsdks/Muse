import { describe, expect, it } from "vitest";

import { applyClarifyDirective, detectUnderspecifiedRequest } from "../src/index.js";

function ctx(messages: { role: "user" | "assistant" | "system"; content: string }[]) {
  return { input: { messages, model: "test/model" }, runId: "r", startedAt: new Date() };
}

describe("detectUnderspecifiedRequest", () => {
  it("flags contentless imperatives with no object/referent", () => {
    for (const t of ["do it", "just send it", "handle that.", "fix this", "sort it out", "take care of it", "go ahead", "please update it"]) {
      expect(detectUnderspecifiedRequest(t).ambiguous, t).toBe(true);
    }
  });

  it("does NOT flag a request that names a real object/topic or is empty/long", () => {
    for (const t of [
      "what's on my calendar tomorrow",
      "summarise the Q3 notes",
      "remind me at 5pm to call Sam about the invoice",
      "do the Q3 report",
      "send the budget email to finance",
      "",
      "please go ahead and reschedule the dentist appointment to next Tuesday afternoon"
    ]) {
      expect(detectUnderspecifiedRequest(t).ambiguous, t).toBe(false);
    }
  });
});

describe("applyClarifyDirective — P0-b4", () => {
  it("prepends a clarify directive when the lone user message is under-specified", () => {
    const out = applyClarifyDirective(ctx([{ content: "do it", role: "user" }]));
    expect(out.messages[0]?.role).toBe("system");
    expect(out.messages[0]?.content).toContain("under-specified");
    expect(out.messages[0]?.content).toContain("clarifying question");
    expect(out.messages[1]).toEqual({ content: "do it", role: "user" });
  });

  it("does NOT fire when a prior assistant turn makes it a confirmation", () => {
    const input = ctx([
      { content: "I can email Sam to confirm — shall I?", role: "assistant" },
      { content: "do it", role: "user" }
    ]);
    expect(applyClarifyDirective(input).messages).toEqual(input.input.messages);
  });

  it("does NOT fire for a well-specified request", () => {
    const input = ctx([{ content: "summarise the Q3 notes", role: "user" }]);
    expect(applyClarifyDirective(input).messages).toEqual(input.input.messages);
  });
});
