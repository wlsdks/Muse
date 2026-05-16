import type { AgentRunInput, AgentRunResult } from "@muse/agent-core";
import {
  InMemoryAgentMessageBus,
  MultiAgentOrchestrator,
  RuleBasedAgentWorker,
  createWorkerResult
} from "@muse/multi-agent";
import { describe, expect, it, vi } from "vitest";

import { toMultiAgentSseStream } from "../src/multi-agent-routes.js";

function busWithClearSpy() {
  const bus = new InMemoryAgentMessageBus();
  const clearSpy = vi.fn();
  const origClear = bus.clear.bind(bus);
  bus.clear = () => {
    clearSpy();
    origClear();
  };
  return { bus, clearSpy };
}

const input: AgentRunInput = { messages: [{ content: "go", role: "user" }], model: "diagnostic" };

describe("toMultiAgentSseStream unsubscribe lifecycle", () => {
  it("clears the bus when the consumer disconnects at the start frame (no leak)", async () => {
    const { bus, clearSpy } = busWithClearSpy();
    const hanging = new RuleBasedAgentWorker(
      "w", "w", ["task"],
      () => new Promise<AgentRunResult>(() => undefined) // never resolves
    );
    const orchestrator = new MultiAgentOrchestrator({ messageBus: bus, workers: [hanging] });
    const gen = toMultiAgentSseStream({
      input, messageBus: bus, mode: "sequential", options: { mode: "sequential" }, orchestrator
    }) as AsyncGenerator<string, void, unknown>;

    const first = await gen.next();
    expect(String(first.value)).toContain("event: start");
    // Consumer / Readable destroyed while suspended at the start
    // frame — pre-fix this yield was outside the try so finally
    // (messageBus.clear) never ran and the subscription leaked.
    await gen.return(undefined);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("clears the bus on normal completion too (no regression)", async () => {
    const { bus, clearSpy } = busWithClearSpy();
    const worker = new RuleBasedAgentWorker(
      "w", "w", ["task"],
      async (i: AgentRunInput) => createWorkerResult("w", "done", i)
    );
    const orchestrator = new MultiAgentOrchestrator({ messageBus: bus, workers: [worker] });
    const gen = toMultiAgentSseStream({
      input, messageBus: bus, mode: "sequential", options: { mode: "sequential" }, orchestrator
    });

    const frames: string[] = [];
    for await (const frame of gen) {
      frames.push(frame);
    }
    expect(frames.join("")).toContain("event: done");
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
