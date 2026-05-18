import { type ModelProvider } from "@muse/model";
import { describe, expect, it } from "vitest";

import { createAgentRuntime, type AmbientSnapshot } from "../src/index.js";

/**
 * P3-b1 end-to-end: with the ambient provider wired into the live
 * agent-runtime pipeline, an ambient change must measurably alter a
 * SUBSEQUENT agent answer. The provider echoes the injected
 * `[Ambient Context]` window into its output, so the answer is a
 * direct function of what Muse perceived — change the perception,
 * the answer changes.
 */
function echoAmbientProvider(): ModelProvider {
  return {
    id: "echo",
    async generate(request) {
      const system = request.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n");
      const match = /window: (.+)/u.exec(system);
      return {
        id: "r",
        model: request.model,
        output: match ? `You are looking at: ${match[1]}` : "No ambient context."
      };
    },
    async listModels() {
      return [];
    },
    async *stream() {}
  };
}

describe("ambient context wired into the live agent-runtime pipeline (P3-b1)", () => {
  it("an ambient change measurably alters a subsequent agent answer", async () => {
    let current: AmbientSnapshot | undefined = { app: "Code", window: "editor.ts — Muse" };
    const runtime = createAgentRuntime({
      ambientSnapshotProvider: { snapshot: () => current },
      modelProvider: echoAmbientProvider()
    });

    const first = await runtime.run({
      messages: [{ content: "what am I doing?", role: "user" }],
      model: "echo/model",
      runId: "amb-1"
    });
    expect(first.response.output).toBe("You are looking at: editor.ts — Muse");

    // The user switches windows; the next turn must reflect the new
    // perception — not the stale one, not a guess.
    current = { app: "Numbers", window: "Q3-budget.xlsx — Numbers" };
    const second = await runtime.run({
      messages: [{ content: "what am I doing now?", role: "user" }],
      model: "echo/model",
      runId: "amb-2"
    });
    expect(second.response.output).toBe("You are looking at: Q3-budget.xlsx — Numbers");
    expect(second.response.output).not.toEqual(first.response.output);
  });

  it("is off by default — no ambient provider means the answer carries no perception (privacy)", async () => {
    const runtime = createAgentRuntime({ modelProvider: echoAmbientProvider() });
    const result = await runtime.run({
      messages: [{ content: "what am I doing?", role: "user" }],
      model: "echo/model",
      runId: "amb-off"
    });
    expect(result.response.output).toBe("No ambient context.");
  });
});
