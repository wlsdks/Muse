import { describe, expect, it } from "vitest";

import { createMuseRuntimeAssembly } from "../src/index.js";

// End-to-end of the assembled response-cache wiring (responseCache +
// cacheMetrics from the store factories) through agentRuntime.run, plus
// the interaction with context-transform injection. Deterministic via
// the diagnostic provider.
const diagnostic = (extra: Record<string, string> = {}) =>
  createMuseRuntimeAssembly({ env: { MUSE_MODEL: "diagnostic/smoke", MUSE_MODEL_PROVIDER_ID: "diagnostic", ...extra } });
const ask = (content: string) => ({ messages: [{ content, role: "user" as const }], model: "diagnostic/smoke" });

describe("createMuseRuntimeAssembly response cache e2e", () => {
  it("serves an identical request from cache on the second run (active-context off → stable key)", async () => {
    const assembly = diagnostic({ MUSE_ACTIVE_CONTEXT_ENABLED: "false" });
    const first = await assembly.agentRuntime!.run(ask("cache me"));
    const second = await assembly.agentRuntime!.run(ask("cache me"));

    expect(first.fromCache ?? false).toBe(false); // miss → populates the cache
    expect(second.fromCache).toBe(true); // exact hit
    expect(second.response.output).toBe(first.response.output);

    const stats = assembly.cache.statsStore.read();
    expect(stats.exactHits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("misses for a different prompt", async () => {
    const assembly = diagnostic({ MUSE_ACTIVE_CONTEXT_ENABLED: "false" });
    await assembly.agentRuntime!.run(ask("first"));
    const other = await assembly.agentRuntime!.run(ask("second different prompt"));
    expect(other.fromCache ?? false).toBe(false);
    expect(assembly.cache.statsStore.read().exactHits).toBe(0);
  });

  it("does NOT serve a stale answer when active-context is on (its per-run timestamp keeps the cache key unique)", async () => {
    const assembly = diagnostic(); // active-context defaults ON
    const first = await assembly.agentRuntime!.run(ask("what's up"));
    const second = await assembly.agentRuntime!.run(ask("what's up"));
    expect(first.fromCache ?? false).toBe(false);
    expect(second.fromCache ?? false).toBe(false); // time-sensitive context → both miss by design
    expect(assembly.cache.statsStore.read().exactHits).toBe(0);
  });
});
