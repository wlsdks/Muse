import { describe, expect, it } from "vitest";
import {
  MultiAgentOrchestrator,
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

describe("MultiAgentOrchestrator", () => {
  it("runs workers sequentially and passes prior worker output forward", async () => {
    const analyst = new RuleBasedAgentWorker("analyst", "Analyst", [], (input) =>
      createWorkerResult("analyst", "analysis complete", input)
    );
    const reviewer = new RuleBasedAgentWorker("reviewer", "Reviewer", [], (input) => {
      expect(input.messages[0]?.content).toContain("analysis complete");
      return createWorkerResult("reviewer", "review complete", input);
    });
    const orchestrator = new MultiAgentOrchestrator({
      idFactory: () => "orchestration-1",
      workers: [analyst, reviewer]
    });

    const result = await orchestrator.run({
      messages: [{ content: "plan project", role: "user" }],
      model: "model-1"
    });

    expect(result).toMatchObject({
      mode: "sequential",
      runId: "orchestration-1"
    });
    expect(result.results.map((step) => [step.workerId, step.status])).toEqual([
      ["analyst", "completed"],
      ["reviewer", "completed"]
    ]);
    expect(result.response.output).toContain("## analyst");
    expect(result.response.output).toContain("## reviewer");
  });

  it("runs workers in parallel and preserves failed worker results without failing the orchestration", async () => {
    const completed = new RuleBasedAgentWorker("completed", "Completed", [], (input) =>
      createWorkerResult("completed", "done", input)
    );
    const failed = new RuleBasedAgentWorker("failed", "Failed", [], () => {
      throw new Error("worker unavailable");
    });
    const orchestrator = new MultiAgentOrchestrator({
      idFactory: () => "orchestration-2",
      workers: [completed, failed]
    });

    const result = await orchestrator.run(
      {
        messages: [{ content: "compare paths", role: "user" }],
        model: "model-1"
      },
      { mode: "parallel" }
    );

    expect(result.results).toEqual([
      expect.objectContaining({ status: "completed", workerId: "completed" }),
      expect.objectContaining({ error: "worker unavailable", status: "failed", workerId: "failed" })
    ]);
    expect(result.response.output).toContain("done");
    expect(result.response.output).toContain("worker unavailable");
  });

  it("fails when every worker fails", async () => {
    const failed = new RuleBasedAgentWorker("failed", "Failed", [], () => {
      throw new Error("worker unavailable");
    });
    const orchestrator = new MultiAgentOrchestrator({ workers: [failed] });

    await expect(
      orchestrator.run({
        messages: [{ content: "compare paths", role: "user" }],
        model: "model-1"
      })
    ).rejects.toThrow(NoAgentWorkerError);
  });
});
