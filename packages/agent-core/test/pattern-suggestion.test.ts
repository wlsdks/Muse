import { describe, expect, it } from "vitest";

import { synthesizePatternSuggestion, type PatternSuggestionInput } from "../src/pattern-suggestion.js";

const input: PatternSuggestionInput = {
  category: "weekly-task",
  confidence: 0.82,
  fallbackSuggestion: "You often add a report task on Mondays.",
  groundedFacts: "weekday=Monday; recurring task ~ 'weekly report'; seen 4 of last 5 weeks"
};

function fakeProvider(output: string | undefined) {
  return { generate: async () => ({ output }) } as unknown as Parameters<typeof synthesizePatternSuggestion>[1]["modelProvider"];
}

describe("synthesizePatternSuggestion", () => {
  it("returns the composed offer from the model", async () => {
    const out = await synthesizePatternSuggestion(input, {
      model: "qwen3:8b",
      modelProvider: fakeProvider("월요일마다 주간 보고서를 만드시던데, 지금 초안 잡아둘까요?")
    });
    expect(out).toBe("월요일마다 주간 보고서를 만드시던데, 지금 초안 잡아둘까요?");
  });

  it("returns undefined when the model declines (NONE → caller keeps fallback / stays silent)", async () => {
    expect(await synthesizePatternSuggestion(input, { model: "m", modelProvider: fakeProvider("NONE") })).toBeUndefined();
  });

  it("is fail-soft on empty output and on a throwing provider", async () => {
    expect(await synthesizePatternSuggestion(input, { model: "m", modelProvider: fakeProvider("") })).toBeUndefined();
    expect(await synthesizePatternSuggestion(input, { model: "m", modelProvider: fakeProvider(undefined) })).toBeUndefined();
    const thrower = { generate: async () => { throw new Error("offline"); } } as unknown as Parameters<typeof synthesizePatternSuggestion>[1]["modelProvider"];
    expect(await synthesizePatternSuggestion(input, { model: "m", modelProvider: thrower })).toBeUndefined();
  });
});
