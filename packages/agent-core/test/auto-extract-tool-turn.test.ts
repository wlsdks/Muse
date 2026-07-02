import { InMemoryUserMemoryStore, createUserMemoryAutoExtractHook } from "@muse/memory";
import { describe, expect, it } from "vitest";

/**
 * P0-b1: a tool-using agent turn must grow the user model.
 * Auto-extract is a wired `afterComplete` hook — tool-agnostic by
 * design (that is exactly why hook-wiring fixes the old REPL path,
 * which skipped extraction when tools were enabled). It needs a
 * `metadata.userId`; inbound-channel chats only started
 * learning the user once the channel-derived userId was wired in.
 */

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

function makeHook(store: InMemoryUserMemoryStore) {
  return createUserMemoryAutoExtractHook({
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
}

// A context that represents a TOOL-USING turn: the assistant called
// a tool and a tool result came back before the final answer.
const toolUsingMessages = [
  { content: "remember I love sushi — and what time is it?", role: "user" as const },
  {
    content: "",
    role: "assistant" as const,
    toolCalls: [{ arguments: {}, id: "t1", name: "time_now" }]
  },
  { content: "2026-05-18T20:00:00Z", name: "time_now", role: "tool" as const, toolCallId: "t1" }
];

describe("P0-b1 — a tool-using API turn grows the user model", () => {
  it("stores an extracted fact under the run's userId after a tool-using turn", async () => {
    const store = new InMemoryUserMemoryStore();
    await makeHook(store).afterComplete!(
      {
        input: { messages: toolUsingMessages, metadata: { userId: "telegram:555" } },
        runId: "r-1"
      },
      { id: "r-1", model: "diag/smoke", output: "It's 8pm — and noted you love sushi." }
    );
    const memory = await store.findByUserId("telegram:555");
    expect(memory?.facts.favourite_food).toBe("sushi");
  });

  it("no-ops without a userId — the gap the channel-derived userId closes", async () => {
    const store = new InMemoryUserMemoryStore();
    await makeHook(store).afterComplete!(
      {
        input: { messages: toolUsingMessages },
        runId: "r-2"
      },
      { id: "r-2", model: "diag/smoke", output: "It's 8pm — and noted you love sushi." }
    );
    expect(await store.findByUserId("telegram:555")).toBeUndefined();
  });
});
