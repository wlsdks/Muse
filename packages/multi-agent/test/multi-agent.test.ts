import { describe, expect, it } from "vitest";
import {
  NoAgentWorkerError,
  RuleBasedAgentWorker,
  SupervisorAgent,
  createWorkerResult
} from "../src/index.js";

describe("SupervisorAgent", () => {
  it("selects the highest confidence worker", async () => {
    const research = new RuleBasedAgentWorker("research", "Research worker", ["research"], (input) =>
      createWorkerResult("research", "research answer", input)
    );
    const code = new RuleBasedAgentWorker("code", "Code worker", ["code"], (input) =>
      createWorkerResult("code", "code answer", input)
    );
    const supervisor = new SupervisorAgent({ workers: [research, code] });

    const result = await supervisor.run({
      messages: [{ content: "Please research this", role: "user" }],
      model: "model-1"
    });

    expect(result).toMatchObject({
      response: { output: "research answer" },
      selectedAgentId: "research"
    });
    expect(result.handoffs).toEqual([
      { confidence: 1, reason: "highest-confidence-worker", to: "research" }
    ]);
  });

  it("falls back after worker failure", async () => {
    const failing = new RuleBasedAgentWorker("primary", "Primary", ["task"], () => {
      throw new Error("primary down");
    });
    const fallback = new RuleBasedAgentWorker("fallback", "Fallback", [], (input) =>
      createWorkerResult("fallback", "fallback answer", input)
    );
    const supervisor = new SupervisorAgent({
      defaultWorkerId: "fallback",
      maxHandoffs: 2,
      minConfidence: 0.5,
      workers: [failing, fallback]
    });

    const result = await supervisor.run({
      messages: [{ content: "task", role: "user" }],
      model: "model-1"
    });

    expect(result.selectedAgentId).toBe("fallback");
    expect(result.handoffs.map((handoff) => handoff.to)).toEqual(["primary", "fallback"]);
  });

  it("requires at least one worker", () => {
    expect(() => new SupervisorAgent({ workers: [] })).toThrow(NoAgentWorkerError);
  });
});
