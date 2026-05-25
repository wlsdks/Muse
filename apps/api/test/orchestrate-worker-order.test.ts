import type { AgentSpec } from "@muse/agent-specs";
import { describe, expect, it } from "vitest";

import { orderWorkersForPipeline } from "../src/multi-agent-routes.js";

function spec(name: string, createdAtIso: string): AgentSpec {
  const when = new Date(createdAtIso);
  return {
    createdAt: when,
    description: "",
    enabled: true,
    id: name.toLowerCase(),
    independentExecution: true,
    keywords: [],
    mode: "standard",
    name,
    toolNames: [],
    updatedAt: when
  };
}

describe("orderWorkersForPipeline — sequential auto-selected workers run in creation order", () => {
  it("orders by createdAt ascending so the earlier-seeded worker runs first, regardless of name", () => {
    const generalist = spec("Generalist", "2026-01-01T00:00:00.000Z");
    const critic = spec("Critic", "2026-01-01T00:00:01.000Z");
    // Input arrives name-alphabetical (Critic before Generalist) — the bug's start state.
    const ordered = orderWorkersForPipeline([critic, generalist]);
    expect(ordered.map((s) => s.name)).toEqual(["Generalist", "Critic"]);
  });

  it("breaks createdAt ties by name", () => {
    const zeta = spec("Zeta", "2026-01-01T00:00:00.000Z");
    const alpha = spec("Alpha", "2026-01-01T00:00:00.000Z");
    expect(orderWorkersForPipeline([zeta, alpha]).map((s) => s.name)).toEqual(["Alpha", "Zeta"]);
  });
});
