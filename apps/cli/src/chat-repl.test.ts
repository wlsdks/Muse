import { describe, expect, it } from "vitest";

import { filterFactsToKeys, parseAgentMode } from "./chat-repl.js";
import { factKeysToInject } from "./chat-grounding.js";

describe("factKeysToInject (per-fact topic relevance — no tangent, recall preserved)", () => {
  const keys = ["user_name", "dog_name", "dentist"];
  it("a general turn keeps only the name (drops the covered-but-unasked dog)", () => {
    expect(factKeysToInject("물 자주 마시는 게 왜 중요해?", keys)).toEqual(["user_name", "dentist"]);
  });
  it("a name-recall turn keeps the name, still drops the unrelated dog", () => {
    expect(factKeysToInject("내 이름 뭐야?", keys)).toEqual(["user_name", "dentist"]);
  });
  it("a dog-recall turn keeps the dog (recall wedge intact)", () => {
    expect(factKeysToInject("내 강아지 이름 뭐야?", keys)).toEqual(["user_name", "dog_name", "dentist"]);
  });
  it("a fact no topic covers (dentist) is always kept so its recall never breaks", () => {
    expect(factKeysToInject("좋은 아침이야", keys)).toContain("dentist");
  });
});

describe("filterFactsToKeys", () => {
  it("keeps only the allowed keys, preserving values", () => {
    expect(filterFactsToKeys({ user_name: "진안", dog_name: "보리" }, ["user_name"])).toEqual({ user_name: "진안" });
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
