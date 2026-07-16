import type { AgentRunInput, AgentRunResult, AgentRuntime } from "@muse/agent-core";
import { describe, expect, it } from "vitest";

import { createCascadeRuntimeAgentWorker, createRuntimeAgentWorker, MultiAgentOrchestrator } from "../src/index.js";

function captureRuntime(confidence: Readonly<Record<string, number>> = {}) {
  const inputs: AgentRunInput[] = [];
  const runtime = {
    run: async (input: AgentRunInput): Promise<AgentRunResult> => {
      inputs.push(input);
      return {
        response: {
          id: `response-${inputs.length.toString()}`,
          logprobs: [{ logprob: confidence[input.model] ?? -0.1, token: "x" }],
          model: input.model,
          output: `ran on ${input.model}`,
          raw: {}
        },
        runId: input.runId ?? "run"
      };
    }
  } as unknown as AgentRuntime;
  return { inputs, runtime };
}

const input: AgentRunInput = {
  messages: [{ content: "Original system", role: "system" }, { content: "Do the work", role: "user" }],
  metadata: { parent: "root" },
  model: "ollama/default",
  runId: "run-1"
};

describe("shared runtime delegation workers", () => {
  it("routes a spec worker through AgentRuntime with the orchestrator model, prompt, and metadata", async () => {
    const capture = captureRuntime();
    const worker = createRuntimeAgentWorker({
      model: "ollama/worker",
      runtime: capture.runtime,
      spec: { description: "Research", id: "researcher", specId: "spec-1", systemPrompt: "Worker system" }
    });
    await new MultiAgentOrchestrator({ workers: [worker] }).run(input);

    expect(capture.inputs).toHaveLength(1);
    expect(capture.inputs[0]?.model).toBe("ollama/worker");
    expect(capture.inputs[0]?.messages[0]).toEqual({ content: "Worker system\n\nOriginal system", role: "system" });
    expect(capture.inputs[0]?.metadata).toEqual({ agentSpecId: "spec-1", parent: "root", selectedAgentId: "researcher" });
  });

  it("keeps cascade routing bounded to fast then heavy on low confidence", async () => {
    const capture = captureRuntime({ "ollama/fast": -2, "ollama/heavy": -0.1 });
    const worker = createCascadeRuntimeAgentWorker({
      confidenceOf: (result) => result.response.logprobs?.[0]?.logprob,
      fastModel: "ollama/fast",
      heavyModel: "ollama/heavy",
      runtime: capture.runtime,
      spec: { description: "Lookup", id: "lookup", specId: "spec-2" }
    });
    const result = await worker.run(input);

    expect(capture.inputs.map((entry) => entry.model)).toEqual(["ollama/fast", "ollama/heavy"]);
    expect(capture.inputs.every((entry) => entry.logprobs === true)).toBe(true);
    expect(result.response.model).toBe("ollama/heavy");
  });

  it("does not call the heavy route when the fast response is confident", async () => {
    const capture = captureRuntime({ "ollama/fast": -0.2 });
    const worker = createCascadeRuntimeAgentWorker({
      confidenceOf: (result) => result.response.logprobs?.[0]?.logprob,
      fastModel: "ollama/fast",
      heavyModel: "ollama/heavy",
      runtime: capture.runtime,
      spec: { description: "Lookup", id: "lookup" }
    });
    await worker.run(input);

    expect(capture.inputs.map((entry) => entry.model)).toEqual(["ollama/fast"]);
  });
});
