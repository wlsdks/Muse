import { describe, expect, it } from "vitest";

import { clusterByTextSimilarity, mergePlaybookStrategies } from "../src/playbook-merge.js";

function fakeProvider(output: string) {
  return { generate: async () => ({ output }) } as unknown as Parameters<typeof mergePlaybookStrategies>[1]["modelProvider"];
}

// Trivial token-overlap similarity for the clusterer test.
function jaccard(a: string, b: string): number {
  const sa = new Set(a.toLowerCase().split(/\s+/u));
  const sb = new Set(b.toLowerCase().split(/\s+/u));
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

describe("clusterByTextSimilarity", () => {
  it("groups similar items, leaves a distinct one alone", () => {
    const items = ["use bullet points when summarising", "use bullets when summarising", "default to next business day when rescheduling"];
    const clusters = clusterByTextSimilarity(items, (s) => s, jaccard, 0.5);
    const sizes = clusters.map((c) => c.length).sort();
    expect(sizes).toEqual([1, 2]);
  });
});

describe("mergePlaybookStrategies", () => {
  it("returns the merged strategy, stripping a stray prefix/quotes", async () => {
    const out = await mergePlaybookStrategies(["use bullets for summaries", "summaries should be bullet points"], {
      model: "qwen3:8b",
      modelProvider: fakeProvider('strategy: "When summarising, use bullet points."')
    });
    expect(out).toBe("When summarising, use bullet points.");
  });
  it("returns undefined on NONE, on <2, and on error", async () => {
    expect(await mergePlaybookStrategies(["a", "b"], { model: "m", modelProvider: fakeProvider("NONE") })).toBeUndefined();
    expect(await mergePlaybookStrategies(["only one"], { model: "m", modelProvider: fakeProvider("x") })).toBeUndefined();
    const thrower = { generate: async () => { throw new Error("offline"); } } as unknown as Parameters<typeof mergePlaybookStrategies>[1]["modelProvider"];
    expect(await mergePlaybookStrategies(["a", "b"], { model: "m", modelProvider: thrower })).toBeUndefined();
  });
});
