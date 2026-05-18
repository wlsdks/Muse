import { InMemoryUserMemoryStore, createUserMemoryAutoExtractHook } from "@muse/memory";
import { describe, expect, it } from "vitest";

import { applyUserMemory } from "../src/context-transforms.js";
import { applyClarifyDirective } from "../src/index.js";

/**
 * P0 target audit (the P→P seam check): the four P0 bullets must
 * COMPOSE into one "knows-you · anticipates · asks" experience, not
 * just pass in isolation. This drives the real exported pipeline
 * functions in the live agent-runtime order (applyUserMemory →
 * applyClarifyDirective, agent-runtime.ts) over the real
 * memory store + auto-extract hook.
 *
 * b3 (proactive investigate-and-surface) is a different surface —
 * the proactive daemon, not the request path — re-run via
 * `@muse/mcp` notes-investigator + proactive-loop and cited in the
 * README P0 audit ledger line.
 */

const USER = "telegram:555";

function extractorProvider(payload: unknown) {
  return {
    id: "extractor",
    async generate() {
      return { id: "x", model: "diag/smoke", output: JSON.stringify(payload) };
    },
    async listModels() {
      return [];
    },
    async *stream() {
      /* the auto-extract hook only calls generate */
    }
  };
}

function ctx(messages: { role: "user" | "assistant" | "system"; content: string }[]) {
  return {
    input: { messages, metadata: { userId: USER }, model: "test/model" },
    runId: "r",
    startedAt: new Date()
  };
}

describe("P0 audit — knows-you + asks compose in one user flow", () => {
  it("a tool-turn fact is recalled on a later differently-worded request, and clarify stays silent on it", async () => {
    const store = new InMemoryUserMemoryStore();

    // b1 — a tool-using turn grows the user model under the run's userId.
    const hook = createUserMemoryAutoExtractHook({
      extractionCooldownMs: 0,
      model: "diag/smoke",
      modelProvider: extractorProvider({
        facts: { favourite_food: "sushi" },
        goals: [],
        preferences: {},
        vetoes: []
      }),
      store
    });
    await hook.afterComplete!(
      {
        input: {
          messages: [
            { content: "remember I love sushi — and what time is it?", role: "user" },
            { content: "", role: "assistant", toolCalls: [{ arguments: {}, id: "t1", name: "time_now" }] },
            { content: "2026-05-18T20:00:00Z", name: "time_now", role: "tool", toolCallId: "t1" }
          ],
          metadata: { userId: USER }
        },
        runId: "r-tool"
      },
      { id: "r-tool", model: "diag/smoke", output: "It's 8pm — noted you love sushi." }
    );

    // b2 — a LATER request that shares no tokens with the stored fact
    // still carries it: applyUserMemory injects it wholesale, so
    // wording never gates recall.
    const memoryApplied = await applyUserMemory(
      ctx([{ content: "what should I get for dinner", role: "user" }]),
      store,
      8
    );
    const memSystem = memoryApplied.messages.find((m) => m.role === "system");
    expect(memSystem?.content).toContain("favourite_food");
    expect(memSystem?.content).toContain("sushi");

    // b4 composes — knowing you must NOT trigger a spurious "what do
    // you mean?" on a well-specified request.
    const afterClarify = applyClarifyDirective({ ...ctx([]), input: memoryApplied });
    expect(afterClarify.messages).toEqual(memoryApplied.messages);
  });

  it("an under-specified first turn is steered to ask — and the clarify directive composes with the injected user memory", async () => {
    const store = new InMemoryUserMemoryStore();
    await createUserMemoryAutoExtractHook({
      extractionCooldownMs: 0,
      model: "diag/smoke",
      modelProvider: extractorProvider({ facts: { favourite_food: "sushi" }, goals: [], preferences: {}, vetoes: [] }),
      store
    }).afterComplete!(
      {
        input: {
          messages: [
            { content: "remember I love sushi", role: "user" },
            { content: "", role: "assistant", toolCalls: [{ arguments: {}, id: "t1", name: "time_now" }] },
            { content: "ok", name: "time_now", role: "tool", toolCallId: "t1" }
          ],
          metadata: { userId: USER }
        },
        runId: "r-tool"
      },
      { id: "r-tool", model: "diag/smoke", output: "noted." }
    );

    // Live pipeline order: applyUserMemory → applyClarifyDirective.
    const memoryApplied = await applyUserMemory(
      ctx([{ content: "do it", role: "user" }]),
      store,
      8
    );
    const afterClarify = applyClarifyDirective({ ...ctx([]), input: memoryApplied });

    // The user-memory section is still present (knows you) AND the
    // clarify directive is prepended (asks, does not guess) — the two
    // transforms compose; neither suppresses the other.
    const hasClarify = afterClarify.messages.some(
      (m) => m.role === "system" && m.content.includes("clarifying question")
    );
    const hasMemory = afterClarify.messages.some(
      (m) => m.role === "system" && m.content.includes("sushi")
    );
    expect(hasClarify).toBe(true);
    expect(hasMemory).toBe(true);
    expect(afterClarify.messages[afterClarify.messages.length - 1]).toEqual({
      content: "do it",
      role: "user"
    });
  });
});
