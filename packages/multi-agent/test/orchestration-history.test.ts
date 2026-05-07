import { describe, expect, it } from "vitest";

import {
  InMemoryOrchestrationHistoryStore,
  MultiAgentOrchestrator,
  NoAgentWorkerError,
  RuleBasedAgentWorker,
  createWorkerResult,
  type OrchestrationHistoryEntry
} from "../src/index.js";

describe("InMemoryOrchestrationHistoryStore", () => {
  function makeEntry(runId: string, startedAtMs = 0): OrchestrationHistoryEntry {
    const startedAt = new Date(startedAtMs);
    const finishedAt = new Date(startedAtMs + 5);
    return {
      completedCount: 1,
      durationMs: 5,
      failedCount: 0,
      finishedAt,
      mode: "sequential",
      runId,
      startedAt,
      status: "completed",
      workerCount: 1
    };
  }

  it("records entries with newest first", () => {
    const store = new InMemoryOrchestrationHistoryStore();
    store.record(makeEntry("first", 1));
    store.record(makeEntry("second", 2));
    expect(store.list().map((entry) => entry.runId)).toEqual(["second", "first"]);
  });

  it("limits the buffer to maxEntries with FIFO eviction of oldest", () => {
    const store = new InMemoryOrchestrationHistoryStore({ maxEntries: 2 });
    store.record(makeEntry("a", 1));
    store.record(makeEntry("b", 2));
    store.record(makeEntry("c", 3));
    expect(store.list().map((entry) => entry.runId)).toEqual(["c", "b"]);
  });

  it("list(limit) returns at most that many entries", () => {
    const store = new InMemoryOrchestrationHistoryStore();
    for (let index = 0; index < 5; index += 1) {
      store.record(makeEntry(`run-${index}`, index));
    }
    expect(store.list(2).map((entry) => entry.runId)).toEqual(["run-4", "run-3"]);
  });

  it("rejects bad bounds", () => {
    expect(() => new InMemoryOrchestrationHistoryStore({ maxEntries: 0 })).toThrow(RangeError);
    const store = new InMemoryOrchestrationHistoryStore();
    expect(() => store.list(-1)).toThrow(RangeError);
  });

  it("clear() empties the buffer", () => {
    const store = new InMemoryOrchestrationHistoryStore();
    store.record(makeEntry("only", 1));
    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe("MultiAgentOrchestrator history recording", () => {
  it("records a completed entry with worker counts and a positive duration", async () => {
    const store = new InMemoryOrchestrationHistoryStore();
    let nowMs = 1_000;
    const orchestrator = new MultiAgentOrchestrator({
      clock: () => new Date(nowMs += 10),
      historyStore: store,
      workers: [
        new RuleBasedAgentWorker("alpha", "Alpha", ["task"], (input) => createWorkerResult("alpha", "ok-a", input)),
        new RuleBasedAgentWorker("beta", "Beta", ["task"], (input) => createWorkerResult("beta", "ok-b", input))
      ]
    });

    const result = await orchestrator.run(
      { messages: [{ content: "task", role: "user" }], model: "model-1" },
      { mode: "parallel" }
    );

    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      completedCount: 2,
      failedCount: 0,
      mode: "parallel",
      runId: result.runId,
      status: "completed",
      workerCount: 2
    });
    expect(entries[0]?.durationMs).toBeGreaterThan(0);
  });

  it("records a failed entry when no worker completes", async () => {
    const store = new InMemoryOrchestrationHistoryStore();
    const orchestrator = new MultiAgentOrchestrator({
      historyStore: store,
      workers: [
        new RuleBasedAgentWorker("primary", "Primary", ["task"], () => {
          throw new Error("boom");
        })
      ]
    });

    await expect(
      orchestrator.run({ messages: [{ content: "task", role: "user" }], model: "model-1" })
    ).rejects.toBeInstanceOf(NoAgentWorkerError);

    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      completedCount: 0,
      failedCount: 1,
      mode: "sequential",
      status: "failed",
      workerCount: 1
    });
    expect(entries[0]?.error).toContain("No worker completed");
  });

  it("records a failed entry when the requested workerIds are unknown", async () => {
    const store = new InMemoryOrchestrationHistoryStore();
    const orchestrator = new MultiAgentOrchestrator({
      historyStore: store,
      workers: [new RuleBasedAgentWorker("alpha", "Alpha", ["task"], (input) => createWorkerResult("alpha", "ok", input))]
    });

    await expect(
      orchestrator.run(
        { messages: [{ content: "task", role: "user" }], model: "model-1" },
        { workerIds: ["does-not-exist"] }
      )
    ).rejects.toBeInstanceOf(NoAgentWorkerError);

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.workerCount).toBe(0);
  });

  it("does not record when no historyStore is provided", async () => {
    const orchestrator = new MultiAgentOrchestrator({
      workers: [
        new RuleBasedAgentWorker("alpha", "Alpha", ["task"], (input) => createWorkerResult("alpha", "ok", input))
      ]
    });
    await orchestrator.run({ messages: [{ content: "task", role: "user" }], model: "model-1" });
    // Nothing to assert — the absence of a thrown error proves the orchestrator
    // tolerates a missing store path.
  });
});
