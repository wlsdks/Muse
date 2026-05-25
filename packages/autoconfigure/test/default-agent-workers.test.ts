import { describe, expect, it } from "vitest";

import { createMuseRuntimeAssembly } from "../src/index.js";

describe("multi-agent default workers (in-memory seeding)", () => {
  it("seeds the two default workers into a fresh in-memory registry so orchestrate has workers", async () => {
    const assembly = createMuseRuntimeAssembly({ env: {} });
    const enabled = await assembly.agentSpecRegistry.listEnabled();
    expect(enabled.map((s) => s.name).sort()).toEqual(["Critic", "Generalist"]);
    // The defaults must not hijack single-agent routing.
    for (const spec of enabled) {
      expect(spec.keywords).toEqual([]);
    }
  });

  it("seeds nothing when MUSE_MULTI_AGENT_DEFAULT_WORKERS=false (preserves the empty→409 path)", async () => {
    const assembly = createMuseRuntimeAssembly({ env: { MUSE_MULTI_AGENT_DEFAULT_WORKERS: "false" } });
    expect(await assembly.agentSpecRegistry.listEnabled()).toHaveLength(0);
  });
});
