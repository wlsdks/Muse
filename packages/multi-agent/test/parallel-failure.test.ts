import { describe, expect, it } from "vitest";

import {
  InMemoryAgentMessageBus,
  InMemoryOrchestrationHistoryStore,
  MultiAgentOrchestrator,
  RuleBasedAgentWorker,
  createWorkerResult,
  type AgentRunInput,
  type AgentRunResult
} from "../src/index.js";

function syntheticWorker(id: string, behavior: "ok" | "throw" | "delayed-ok"): RuleBasedAgentWorker {
  return new RuleBasedAgentWorker(id, `worker ${id}`, ["task"], async (input: AgentRunInput): Promise<AgentRunResult> => {
    if (behavior === "throw") {
      throw new Error(`${id} failed deliberately`);
    }
    if (behavior === "delayed-ok") {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return createWorkerResult(id, `${id}-output`, input);
  });
}

describe("MultiAgentOrchestrator parallel + bus interactions", () => {
  it("parallel mode publishes one bus message per worker even when some fail", async () => {
    const messageBus = new InMemoryAgentMessageBus();
    const orchestrator = new MultiAgentOrchestrator({
      messageBus,
      workers: [
        syntheticWorker("alpha", "ok"),
        syntheticWorker("beta", "throw"),
        syntheticWorker("gamma", "ok")
      ]
    });

    const result = await orchestrator.run(
      { messages: [{ content: "task", role: "user" }], model: "diagnostic" },
      { mode: "parallel" }
    );

    const conversation = messageBus.getConversation();
    expect(conversation).toHaveLength(3);
    const bySource = Object.fromEntries(conversation.map((message) => [message.sourceAgentId, message]));
    expect(bySource.alpha?.content).toBe("alpha-output");
    expect(bySource.beta?.content).toBe("beta failed deliberately");
    expect(bySource.beta?.metadata).toMatchObject({ status: "failed" });
    expect(bySource.gamma?.content).toBe("gamma-output");

    expect(result.results.filter((step) => step.status === "completed")).toHaveLength(2);
    expect(result.results.find((step) => step.status === "failed")?.workerId).toBe("beta");
  });

  it("parallel mode does not abort the run when one worker is slower than another", async () => {
    const orchestrator = new MultiAgentOrchestrator({
      workers: [syntheticWorker("fast", "ok"), syntheticWorker("slow", "delayed-ok")]
    });

    const result = await orchestrator.run(
      { messages: [{ content: "task", role: "user" }], model: "diagnostic" },
      { mode: "parallel" }
    );
    const ids = result.results.map((step) => step.workerId).sort();
    expect(ids).toEqual(["fast", "slow"]);
    expect(result.results.every((step) => step.status === "completed")).toBe(true);
  });

  it("history store preserves the failed-with-partial-success snapshot", async () => {
    const historyStore = new InMemoryOrchestrationHistoryStore();
    const orchestrator = new MultiAgentOrchestrator({
      historyStore,
      workers: [
        syntheticWorker("alpha", "ok"),
        syntheticWorker("beta", "throw")
      ]
    });

    const result = await orchestrator.run(
      { messages: [{ content: "task", role: "user" }], model: "diagnostic" },
      { mode: "parallel" }
    );

    const entry = historyStore.getByRunId(result.runId);
    expect(entry?.status).toBe("completed"); // at least one succeeded
    expect(entry?.completedCount).toBe(1);
    expect(entry?.failedCount).toBe(1);
    expect(entry?.workerCount).toBe(2);
  });

  it("isolates targeted bus subscribers from unrelated broadcasts", async () => {
    const messageBus = new InMemoryAgentMessageBus();
    const seenByAlpha: string[] = [];
    const seenByBeta: string[] = [];
    messageBus.subscribe("alpha", (message) => {
      seenByAlpha.push(message.sourceAgentId);
    });
    messageBus.subscribe("beta", (message) => {
      seenByBeta.push(message.sourceAgentId);
    });

    // Targeted to alpha — beta must not see it.
    await messageBus.publish({
      content: "private",
      sourceAgentId: "supervisor",
      targetAgentId: "alpha",
      timestamp: new Date()
    });
    // Broadcast — both must see it.
    await messageBus.publish({
      content: "public",
      sourceAgentId: "supervisor",
      timestamp: new Date()
    });

    expect(seenByAlpha).toEqual(["supervisor", "supervisor"]);
    expect(seenByBeta).toEqual(["supervisor"]);
  });

  it("failed-only orchestration rejects with NoAgentWorkerError but still records the failure", async () => {
    const historyStore = new InMemoryOrchestrationHistoryStore();
    const orchestrator = new MultiAgentOrchestrator({
      historyStore,
      workers: [syntheticWorker("primary", "throw"), syntheticWorker("secondary", "throw")]
    });

    await expect(
      orchestrator.run({ messages: [{ content: "task", role: "user" }], model: "diagnostic" }, { mode: "parallel" })
    ).rejects.toThrow(/No worker completed/u);
    const entries = historyStore.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("failed");
    expect(entries[0]?.completedCount).toBe(0);
    expect(entries[0]?.failedCount).toBeGreaterThanOrEqual(1);
  });
});
