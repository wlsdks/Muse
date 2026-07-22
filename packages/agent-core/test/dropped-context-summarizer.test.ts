import { describe, expect, it } from "vitest";

import type { ModelProvider, ModelRequest } from "@muse/model";
import type { ConversationMessage } from "@muse/memory";
import { createRetryBudget, runWithRetryBudget } from "@muse/resilience";

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

/**
 * Injectable sleep for retry-backoff tests: resolves instantly (no real
 * wall-clock wait) and records every requested delay so tests can assert
 * the retry loop actually backed off, without the test taking real time.
 */
function fakeSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    }
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

  describe("focus-topic directive (hermes' /compact <focus>, adapted)", () => {
    it("includes a focus directive naming the topic when focusTopic is set", async () => {
      let seen: ModelRequest | undefined;
      const summarize = createModelDroppedContextSummarizer(fakeProvider("ok", (r) => { seen = r; }), "ollama/gemma4:12b");
      await summarize(dropped, { focusTopic: "the migration" });
      const system = seen?.messages.find((m) => m.role === "system")?.content ?? "";
      expect(system).toContain("the migration");
    });

    it("omits the focus directive when focusTopic is unset (byte-identical prompt)", async () => {
      let seenUnset: ModelRequest | undefined;
      let seenExplicitEmpty: ModelRequest | undefined;
      const summarizeUnset = createModelDroppedContextSummarizer(fakeProvider("ok", (r) => { seenUnset = r; }), "ollama/gemma4:12b");
      const summarizeEmpty = createModelDroppedContextSummarizer(fakeProvider("ok", (r) => { seenExplicitEmpty = r; }), "ollama/gemma4:12b");
      await summarizeUnset(dropped);
      await summarizeEmpty(dropped, { focusTopic: "   " });
      const systemUnset = seenUnset?.messages.find((m) => m.role === "system")?.content ?? "";
      const systemEmpty = seenExplicitEmpty?.messages.find((m) => m.role === "system")?.content ?? "";
      expect(systemUnset).toBe(systemEmpty);
      expect(systemUnset).not.toContain("Preserve FULL detail");
    });
  });

  it("propagates a provider error after exhausting all retry attempts (fail-open handled upstream by summarizeDroppedContext)", async () => {
    const { sleep } = fakeSleep();
    const { provider, calls } = scriptedProvider(() => { throw new Error("ollama down"); });
    const summarize = createModelDroppedContextSummarizer(provider, "m", { sleep });
    await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
    // default maxAttempts is 3 total attempts (1 + 2 retries), not 1.
    expect(calls).toHaveLength(3);
  });

  describe("failure retry (DS-18)", () => {
    it("charges retries to the current foreground scope without a memory-package dependency", async () => {
      const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
      const { provider, calls } = scriptedProvider((callIndex) => {
        if (callIndex === 0) throw new Error("transient");
        return EFFECTIVE_OUTPUT;
      });
      const summarize = createModelDroppedContextSummarizer(provider, "m", {
        retryInitialDelayMs: 2,
        retryMaxDelayMs: 2,
        sleep: async () => {}
      });

      await expect(runWithRetryBudget(budget, () => summarize(dropped))).resolves.toBe(EFFECTIVE_OUTPUT);
      expect(calls).toHaveLength(2);
      expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 2, usedRetries: 1 });
    });

    it("propagates cancellation to retry backoff and the physical provider request", async () => {
      const controller = new AbortController();
      const cancellation = new Error("cancel auxiliary summary");
      const { provider, calls } = scriptedProvider(() => { throw new Error("transient"); });
      const summarize = createModelDroppedContextSummarizer(provider, "m", {
        sleep: async () => {
          controller.abort(cancellation);
          await new Promise<void>(() => {});
        }
      });

      await expect(summarize(dropped, { signal: controller.signal })).rejects.toBe(cancellation);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.signal).toBe(controller.signal);
    });

    it("retries a transient failure within a single call and succeeds without opening the cooldown", async () => {
      const clock = fakeClock(0);
      const { sleep, delays } = fakeSleep();
      const { provider, calls } = scriptedProvider((callIndex) => {
        if (callIndex === 0) throw new Error("transient blip");
        return EFFECTIVE_OUTPUT;
      });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now, sleep });

      const result = await summarize(dropped);
      expect(result).toBe(EFFECTIVE_OUTPUT);
      // the failed first attempt + the succeeding retry, well short of a full 10-min gate.
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls.length).toBeLessThanOrEqual(3);
      expect(delays.length).toBeGreaterThan(0); // backoff was actually requested between attempts

      // cooldown must NOT have opened: the very next call still reaches the LLM.
      const callsBeforeSecondSummarize = calls.length;
      const second = await summarize(dropped);
      expect(second).toBe(EFFECTIVE_OUTPUT);
      expect(calls.length).toBeGreaterThan(callsBeforeSecondSummarize);
    });

    it("uses the injectable sleep for exponential backoff delays instead of real wall-clock time", async () => {
      const { sleep, delays } = fakeSleep();
      const { provider } = scriptedProvider(() => { throw new Error("ollama down"); });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { sleep });

      const start = Date.now();
      await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
      const elapsedMs = Date.now() - start;

      // 3 attempts -> 2 backoff delays, strictly increasing (exponential).
      expect(delays).toHaveLength(2);
      expect(delays[1]).toBeGreaterThan(delays[0] ?? 0);
      // the fake sleep never actually waited, so this ran near-instantly —
      // proves the delays were requested via the injected sleep, not a real timer.
      expect(elapsedMs).toBeLessThan(1_000);
    });
  });

  describe("failure cooldown", () => {
    it("skips the LLM call entirely on the 2nd compaction within the cooldown window", async () => {
      const clock = fakeClock(0);
      const { sleep } = fakeSleep();
      const { provider, calls } = scriptedProvider(() => { throw new Error("ollama down"); });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now, sleep });

      await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
      expect(calls).toHaveLength(3); // all 3 attempts exhausted before the cooldown opened

      const result = await summarize(dropped);
      expect(result).toBe("");
      expect(calls).toHaveLength(3); // no further LLM attempt while in cooldown
    });

    it("retries the LLM call once the cooldown window has elapsed", async () => {
      const clock = fakeClock(0);
      const { sleep } = fakeSleep();
      const { provider, calls } = scriptedProvider((callIndex) => {
        if (callIndex < 3) throw new Error("ollama down"); // exhausts the first summarize()'s 3 attempts
        return EFFECTIVE_OUTPUT;
      });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now, sleep });

      await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
      expect(calls).toHaveLength(3);

      clock.advance(60_001);
      const result = await summarize(dropped);
      expect(result).toBe(EFFECTIVE_OUTPUT);
      expect(calls).toHaveLength(4); // cooldown expired — the retry actually reached the LLM
    });

    it("still opens the cooldown after all bounded retries are exhausted", async () => {
      const clock = fakeClock(0);
      const { sleep } = fakeSleep();
      const { provider, calls } = scriptedProvider(() => { throw new Error("ollama down"); });
      const summarize = createModelDroppedContextSummarizer(provider, "m", { cooldownMs: 60_000, now: clock.now, sleep });

      await expect(summarize(dropped)).rejects.toThrow(/ollama down/);
      expect(calls).toHaveLength(3);

      clock.advance(59_000); // still within the cooldown
      const result = await summarize(dropped);
      expect(result).toBe("");
      expect(calls).toHaveLength(3);
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
