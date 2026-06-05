import { describe, expect, it } from "vitest";

import { parseAgentMode, pickIdentityFacts } from "./chat-repl.js";

describe("pickIdentityFacts (non-recall turns get ONLY the name, no tangent-prone entity facts)", () => {
  it("keeps user_name, drops entity facts (dog_name, dentist, …)", () => {
    expect(pickIdentityFacts({ user_name: "진안", dog_name: "보리", dentist: "Dr. Kim" })).toEqual({ user_name: "진안" });
  });
  it("returns {} when there is no name to address by", () => {
    expect(pickIdentityFacts({ dog_name: "보리" })).toEqual({});
  });
});

describe("parseAgentMode", () => {
  it("returns undefined when --mode is unset", () => {
    expect(parseAgentMode(undefined)).toBeUndefined();
  });

  it("accepts the two documented modes (case + whitespace insensitive)", () => {
    expect(parseAgentMode("react")).toBe("react");
    expect(parseAgentMode("plan_execute")).toBe("plan_execute");
    expect(parseAgentMode("  REACT  ")).toBe("react");
    expect(parseAgentMode("Plan_Execute")).toBe("plan_execute");
  });

  it("rejects an unknown mode with a `did you mean` hint for a near-miss typo (goal-493 sibling)", () => {
    expect(() => parseAgentMode("reactt"))
      .toThrow(/--mode must be 'react' or 'plan_execute'.*did you mean 'react'/u);
    expect(() => parseAgentMode("plan_execut"))
      .toThrow(/did you mean 'plan_execute'/u);
  });

  it("rejects without a guess when nothing is close (no random suggestion)", () => {
    expect(() => parseAgentMode("totallydifferent"))
      .toThrow(/--mode must be 'react' or 'plan_execute' \(got 'totallydifferent'\)$/u);
  });
});
