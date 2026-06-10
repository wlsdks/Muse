import { describe, expect, it } from "vitest";

import {
  MultiAgentOrchestrator,
  RuleBasedAgentWorker,
  SupervisorAgent,
  createWorkerResult,
  validateWorkerHandoff,
  type AgentRunInput,
  type AgentRunResult
} from "../src/index.js";

function workerReturning(id: string, output: string, capture?: (input: AgentRunInput) => void): RuleBasedAgentWorker {
  return new RuleBasedAgentWorker(id, `worker ${id}`, ["task"], async (input: AgentRunInput): Promise<AgentRunResult> => {
    capture?.(input);
    return createWorkerResult(id, output, input);
  });
}

describe("validateWorkerHandoff", () => {
  it("accepts a substantive output and carries it typed", () => {
    const handoff = validateWorkerHandoff("research", "  the answer  ");
    expect(handoff.ok).toBe(true);
    if (handoff.ok) {
      expect(handoff.workerId).toBe("research");
      expect(handoff.output).toBe("the answer");
    }
  });

  it("fail-close: a blank or whitespace-only output is rejected with a reason", () => {
    for (const blank of ["", "   ", "\n\t"]) {
      const handoff = validateWorkerHandoff("research", blank);
      expect(handoff.ok).toBe(false);
      if (!handoff.ok) {
        expect(handoff.reason).toContain("research");
      }
    }
  });
});

describe("orchestrator hand-off fail-close (MAST: information withholding)", () => {
  it("sequential: a blank worker output becomes a FAILED step and the next worker is told so", async () => {
    const seen: AgentRunInput[] = [];
    const orchestrator = new MultiAgentOrchestrator({
      workers: [
        workerReturning("empty", "   "),
        workerReturning("next", "real answer", (input) => seen.push(input))
      ]
    });
    const result = await orchestrator.run(
      { messages: [{ content: "task", role: "user" }], model: "diagnostic" },
      { mode: "sequential" }
    );
    const statuses = Object.fromEntries(result.results.map((step) => [step.workerId, step.status]));
    expect(statuses.empty).toBe("failed");
    expect(statuses.next).toBe("completed");
    const handoffText = seen[0]?.messages.map((message) => message.content).join("\n") ?? "";
    expect(handoffText).toContain("failed");
    expect(handoffText).not.toContain("completed:");
  });

  it("parallel: a blank worker output is reported failed, not silently completed", async () => {
    const orchestrator = new MultiAgentOrchestrator({
      workers: [workerReturning("empty", ""), workerReturning("solid", "real answer")]
    });
    const result = await orchestrator.run(
      { messages: [{ content: "task", role: "user" }], model: "diagnostic" },
      { mode: "parallel" }
    );
    const statuses = Object.fromEntries(result.results.map((step) => [step.workerId, step.status]));
    expect(statuses.empty).toBe("failed");
    expect(statuses.solid).toBe("completed");
  });

  it("race: a blank answer never wins — the substantive worker does", async () => {
    const orchestrator = new MultiAgentOrchestrator({
      workers: [workerReturning("blank-fast", ""), workerReturning("solid", "real answer")]
    });
    const result = await orchestrator.run(
      { messages: [{ content: "task", role: "user" }], model: "diagnostic" },
      { mode: "race" }
    );
    const completed = result.results.filter((step) => step.status === "completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]?.workerId).toBe("solid");
  });
});

describe("supervisor hand-off fail-close", () => {
  it("a blank-output worker is excluded and the fallback answers", async () => {
    const supervisor = new SupervisorAgent({
      workers: [
        workerReturning("primary", "   "),
        workerReturning("fallback", "fallback answer")
      ]
    });
    const result = await supervisor.run({ messages: [{ content: "task", role: "user" }], model: "diagnostic" });
    expect(result.response.output).toBe("fallback answer");
    expect(result.selectedAgentId).toBe("fallback");
  });
});
