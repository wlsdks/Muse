import { describe, expect, it } from "vitest";

import { MultiAgentOrchestrator, RuleBasedAgentWorker, createWorkerResult } from "../src/index.js";

function twoWorkers() {
  const a = new RuleBasedAgentWorker("Generalist", "Generalist", [], (input) =>
    createWorkerResult("Generalist", "Redis caching is fast.", input)
  );
  const b = new RuleBasedAgentWorker("Critic", "Critic", [], (input) =>
    createWorkerResult("Critic", "Risks & gaps: stale data, cache poisoning.", input)
  );
  return [a, b];
}

describe("MultiAgentOrchestrator — final-answer synthesis (SB next: one coherent answer)", () => {
  it("when synthesizeFinalAnswer is provided, response.output is the synthesized answer (not the ## Name concat)", async () => {
    const orchestrator = new MultiAgentOrchestrator({ idFactory: () => "o1", workers: twoWorkers() });
    const seen: Array<{ workerId: string; output: string }> = [];
    const result = await orchestrator.run(
      { messages: [{ content: "should we cache in redis?", role: "user" }], model: "m" },
      {
        synthesizeFinalAnswer: async (parts) => {
          for (const p of parts) seen.push(p);
          return "FINAL: cache in Redis but guard against stale data.";
        }
      }
    );
    expect(result.response.output).toBe("FINAL: cache in Redis but guard against stale data.");
    // synthesizer receives every completed worker's output, in order
    expect(seen.map((p) => p.workerId)).toEqual(["Generalist", "Critic"]);
    expect(seen[1]!.output).toContain("Risks & gaps");
    // worker-level fidelity is preserved on results even when synthesized
    expect(result.results.map((r) => r.workerId)).toEqual(["Generalist", "Critic"]);
  });

  it("without a synthesizer, falls back to the existing ## Name concatenation (back-compat)", async () => {
    const orchestrator = new MultiAgentOrchestrator({ idFactory: () => "o2", workers: twoWorkers() });
    const result = await orchestrator.run({ messages: [{ content: "x", role: "user" }], model: "m" });
    expect(result.response.output).toContain("## Generalist");
    expect(result.response.output).toContain("## Critic");
  });

  it("a throwing synthesizer falls back to the concatenation (fail-soft, never loses the answer)", async () => {
    const orchestrator = new MultiAgentOrchestrator({ idFactory: () => "o3", workers: twoWorkers() });
    const result = await orchestrator.run(
      { messages: [{ content: "x", role: "user" }], model: "m" },
      { synthesizeFinalAnswer: async () => { throw new Error("synth down"); } }
    );
    expect(result.response.output).toContain("## Generalist");
  });
});

describe("MultiAgentOrchestrator — verification against the original objective (MAST +15.6%)", () => {
  it("an UNSATISFIED verdict records the verdict AND appends an honest 'incomplete' note naming what's missing", async () => {
    const orchestrator = new MultiAgentOrchestrator({ idFactory: () => "v1", workers: twoWorkers() });
    let sawObjective = "";
    const result = await orchestrator.run(
      { messages: [{ content: "should we cache in redis, and what are the risks?", role: "user" }], model: "m" },
      {
        synthesizeFinalAnswer: async () => "Cache in Redis.", // drops the risks the user asked for
        verifyFinalAnswer: async (objective, output) => {
          sawObjective = objective;
          return output.includes("risk") ? { satisfied: true } : { missing: "the risks", satisfied: false };
        }
      }
    );
    expect(sawObjective).toBe("should we cache in redis, and what are the risks?"); // verifier gets the ORIGINAL ask
    expect(result.response.output).toContain("Cache in Redis.");
    expect(result.response.output).toContain("⚠ This answer may be incomplete");
    expect(result.response.output).toContain("still missing: the risks");
    expect((result.response.raw as { verification?: { satisfied: boolean; missing?: string } }).verification).toEqual({ missing: "the risks", satisfied: false });
  });

  it("a SATISFIED verdict ships the answer clean (no note) but still records the verdict", async () => {
    const orchestrator = new MultiAgentOrchestrator({ idFactory: () => "v2", workers: twoWorkers() });
    const result = await orchestrator.run(
      { messages: [{ content: "cache?", role: "user" }], model: "m" },
      {
        synthesizeFinalAnswer: async () => "Cache in Redis; risks: stale data.",
        verifyFinalAnswer: async () => ({ satisfied: true })
      }
    );
    expect(result.response.output).toBe("Cache in Redis; risks: stale data.");
    expect(result.response.output).not.toContain("incomplete");
    expect((result.response.raw as { verification?: { satisfied: boolean } }).verification).toEqual({ satisfied: true });
  });

  it("a throwing verifier is fail-soft — the answer still ships, no verification field", async () => {
    const orchestrator = new MultiAgentOrchestrator({ idFactory: () => "v3", workers: twoWorkers() });
    const result = await orchestrator.run(
      { messages: [{ content: "cache?", role: "user" }], model: "m" },
      {
        synthesizeFinalAnswer: async () => "Cache in Redis.",
        verifyFinalAnswer: async () => { throw new Error("judge down"); }
      }
    );
    expect(result.response.output).toBe("Cache in Redis.");
    expect((result.response.raw as { verification?: unknown }).verification).toBeUndefined();
  });
});
