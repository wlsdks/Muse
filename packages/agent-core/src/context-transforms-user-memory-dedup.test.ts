import { describe, expect, it } from "vitest";

import { applyUserMemory } from "./context-transforms.js";
import type { AgentRunContext, UserMemoryProvider, UserMemorySnapshot } from "./types.js";

const snapshot: UserMemorySnapshot = {
  userId: "u",
  facts: { name: "Jinan" },
  preferences: { language: "Korean" }
};

const provider: UserMemoryProvider = {
  findByUserId: () => snapshot
};

function contextWith(metadata: Record<string, unknown>): AgentRunContext {
  return {
    runId: "run-1",
    startedAt: new Date("2026-05-12T00:00:00Z"),
    input: {
      model: "test",
      messages: [{ content: "hi", role: "user" }],
      metadata: metadata as AgentRunContext["input"]["metadata"]
    }
  };
}

describe("applyUserMemory — personaPreinjected de-dup (the CLI already hand-injected buildMusePersona)", () => {
  it("skips the user-memory section when the run is flagged personaPreinjected (no double-injection)", async () => {
    const out = await applyUserMemory(contextWith({ userId: "u", personaPreinjected: true }), provider, 40);
    // Input returned unchanged: no [User Memory] system section, no memory metadata.
    expect(out.messages).toHaveLength(1);
    expect(out.messages.some((m) => m.role === "system")).toBe(false);
    expect(out.metadata?.userMemoryFactCount).toBeUndefined();
  });

  it("MUTATION-RED: WITHOUT the flag, the section IS injected (proves the skip above is load-bearing)", async () => {
    const out = await applyUserMemory(contextWith({ userId: "u" }), provider, 40);
    // Removing the personaPreinjected skip would make the flagged case behave
    // exactly like this one — a [User Memory] system section appears.
    const system = out.messages.find((m) => m.role === "system");
    expect(system?.content).toContain("[User Memory]");
    expect(system?.content).toContain("name: Jinan");
    expect(out.metadata?.userMemoryFactCount).toBe(1);
  });

  it("a falsey / absent personaPreinjected does NOT skip (only strict true skips)", async () => {
    const out = await applyUserMemory(contextWith({ userId: "u", personaPreinjected: false }), provider, 40);
    expect(out.messages.find((m) => m.role === "system")?.content).toContain("[User Memory]");
  });
});
