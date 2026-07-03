import { describe, expect, it } from "vitest";

import type { ModelProvider, ModelRequest } from "@muse/model";
import type { ConversationMessage } from "@muse/memory";

import { createModelDroppedContextSummarizer } from "../src/index.js";

function fakeProvider(output: string, capture?: (req: ModelRequest) => void): ModelProvider {
  return {
    id: "fake",
    async listModels() { return []; },
    async generate(request: ModelRequest) {
      capture?.(request);
      return { id: "r", model: request.model, output };
    },
    async *stream() { /* unused */ }
  };
}

const dropped: ConversationMessage[] = [
  { content: "we agreed to ship Friday", role: "assistant" },
  { content: "what about the migration?", role: "user" }
];

/**
 * A provider whose per-call behavior is driven by `handler(callIndex)`:
 * returning a string succeeds with that output; throwing propagates. Tracks
 * every accepted call so tests can assert the aux LLM was (or was NOT)
 * actually invoked — the mechanism the cooldown/skip tests rely on.
 */
function scriptedProvider(handler: (callIndex: number) => string): { provider: ModelProvider; calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  const provider: ModelProvider = {
    id: "scripted",
    async listModels() { return []; },
    async generate(request: ModelRequest) {
      const callIndex = calls.length;
      calls.push(request); // record the attempt BEFORE invoking the handler so a throw still counts
      const output = handler(callIndex);
      return { id: "r", model: request.model, output };
    },
    async *stream() { /* unused */ }
  };
  return { provider, calls };
}

function fakeClock(startMs: number) {
  let current = startMs;
  return {
    advance: (ms: number) => { current += ms; },
    now: () => new Date(current)
  };
}

// Mirrors the `role: content` transcript join createModelDroppedContextSummarizer
// builds internally, so the effective/ineffective fixtures below stay correct
// against the real savedRatio calculation even if `dropped` changes.
const TRANSCRIPT_LENGTH = dropped.map((message) => `${message.role}: ${message.content}`).join("\n").length;
const EFFECTIVE_OUTPUT = "Friday ship; migration open."; // saves well over 10%
const INEFFECTIVE_OUTPUT = "x".repeat(Math.ceil(TRANSCRIPT_LENGTH * 0.95)); // saves well under 10%

describe("createModelDroppedContextSummarizer (CMP-2 production summarizer)", () => {
  it("returns the model's output as the summary", async () => {
    const summarize = createModelDroppedContextSummarizer(fakeProvider("Friday ship; migration open."), "ollama/gemma4:12b");
    expect(await summarize(dropped)).toBe("Friday ship; migration open.");
  });

  it("sends the dropped turns (role + content) to the configured model", async () => {
    let seen: ModelRequest | undefined;
    const summarize = createModelDroppedContextSummarizer(fakeProvider("ok", (r) => { seen = r; }), "ollama/gemma4:12b");
    await summarize(dropped);
    expect(seen?.model).toBe("ollama/gemma4:12b");
    const userMsg = seen?.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContain("we agreed to ship Friday");
    expect(userMsg?.content).toContain("what about the migration?");
    // a system instruction frames the summarization task
    expect(seen?.messages.some((m) => m.role === "system")).toBe(true);
  });

  it("propagates a provider error on the FIRST call (fail-open handled upstream by summarizeDroppedContext)", async () => {
    const provider: ModelProvider = {
      id: "boom", async listModels() { return []; },
      async generate() { throw new Error("ollama down"); },
      async *stream() { /* unused */ }
    };
    const summarize = createModelDroppedContextSummarizer(provider, "m");
    await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
  });

  describe("failure cooldown", () => {
    it("skips the LLM call entirely on the 2nd compaction within the cooldown window", async () => {
      const clock = fakeClock(0);
      const { provider, calls } = scriptedProvider(() => { throw new Error("ollama down"); });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now });

      await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
      expect(calls).toHaveLength(1);

      const result = await summarize(dropped);
      expect(result).toBe("");
      expect(calls).toHaveLength(1); // no second LLM attempt while in cooldown
    });

    it("retries the LLM call once the cooldown window has elapsed", async () => {
      const clock = fakeClock(0);
      const { provider, calls } = scriptedProvider((callIndex) => {
        if (callIndex === 0) throw new Error("ollama down");
        return EFFECTIVE_OUTPUT;
      });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now });

      await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
      expect(calls).toHaveLength(1);

      clock.advance(60_001);
      const result = await summarize(dropped);
      expect(result).toBe(EFFECTIVE_OUTPUT);
      expect(calls).toHaveLength(2); // cooldown expired — the retry actually reached the LLM
    });
  });

  describe("ineffectiveness skip", () => {
    it("skips the LLM call after 2 consecutive summaries that each saved less than 10%", async () => {
      const clock = fakeClock(0);
      const { provider, calls } = scriptedProvider(() => INEFFECTIVE_OUTPUT);
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now });

      const first = await summarize(dropped);
      expect(first).toBe(INEFFECTIVE_OUTPUT);
      expect(calls).toHaveLength(1);

      const second = await summarize(dropped);
      expect(second).toBe(INEFFECTIVE_OUTPUT);
      expect(calls).toHaveLength(2);

      // 2 consecutive ineffective rounds trip the gate — the 3rd compaction
      // is skipped without attempting the LLM call.
      const third = await summarize(dropped);
      expect(third).toBe("");
      expect(calls).toHaveLength(2);
    });

    it("resets the ineffectiveness streak when a post-cooldown retry is effective enough", async () => {
      const clock = fakeClock(0);
      let call = 0;
      const { provider, calls } = scriptedProvider(() => {
        call += 1;
        if (call <= 2) return INEFFECTIVE_OUTPUT; // rounds 1-2: ineffective, trips the gate
        if (call === 3) return EFFECTIVE_OUTPUT; // round 3 (post-cooldown): effective, resets streak
        return INEFFECTIVE_OUTPUT; // round 4: ineffective again, but streak restarted at 1
      });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now });

      await summarize(dropped); // round 1: ineffective
      await summarize(dropped); // round 2: ineffective -> gate opens
      expect(calls).toHaveLength(2);

      const skipped = await summarize(dropped); // still within cooldown -> skipped
      expect(skipped).toBe("");
      expect(calls).toHaveLength(2);

      clock.advance(60_001); // cooldown elapses
      const third = await summarize(dropped); // round 3: attempted again and effective
      expect(third).toBe(EFFECTIVE_OUTPUT);
      expect(calls).toHaveLength(3);

      // a single ineffective round right after should NOT immediately re-skip:
      // round 3 resetting the streak means round 4 is only streak=1, below the limit.
      const fourth = await summarize(dropped);
      expect(fourth).toBe(INEFFECTIVE_OUTPUT);
      expect(calls).toHaveLength(4);
    });
  });
});
