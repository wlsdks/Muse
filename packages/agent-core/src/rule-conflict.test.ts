import { describe, expect, it } from "vitest";

import { classifyRuleConflict, findConflictingRuleIds } from "./rule-conflict.js";

/**
 * The fake reads the pair it is given and answers from a rule, so it depends on
 * its inputs — a stub that returned a fixed verdict would pass on broken code,
 * which is the exact trap that shipped a vacuous test in the first attempt at
 * this slice. `verdictFor` decides CONFLICT/OK from the actual A/B text.
 */
const providerThat = (verdictFor: (a: string, b: string) => "CONFLICT" | "OK" | string) => {
  const calls: { a: string; b: string }[] = [];
  return {
    calls,
    provider: {
      generate: async (request: { messages: readonly { content: string }[] }) => {
        const user = request.messages.find((m) => m.content.startsWith("A: "))?.content ?? "";
        const [, a = "", b = ""] = /^A: ([\s\S]*)\nB: ([\s\S]*)$/u.exec(user) ?? [];
        calls.push({ a, b });
        return { output: verdictFor(a, b) };
      }
    }
  };
};

describe("classifyRuleConflict — the binary LLM conflict gate", () => {
  it("returns true when the model says CONFLICT", async () => {
    const { provider } = providerThat(() => "CONFLICT");
    expect(await classifyRuleConflict("be concise", "explain in full detail", { model: "m", modelProvider: provider })).toBe(true);
  });

  it("returns false when the model says OK", async () => {
    const { provider } = providerThat(() => "OK");
    expect(await classifyRuleConflict("be concise", "answer in Korean", { model: "m", modelProvider: provider })).toBe(false);
  });

  it("passes BOTH rule texts to the model — not a fixed prompt", async () => {
    const { calls, provider } = providerThat(() => "OK");
    await classifyRuleConflict("rule alpha", "rule beta", { model: "m", modelProvider: provider });
    expect(calls[0]).toEqual({ a: "rule alpha", b: "rule beta" });
  });

  it("is fail-soft on an empty rule — no model call, undefined verdict", async () => {
    const { calls, provider } = providerThat(() => "CONFLICT");
    expect(await classifyRuleConflict("", "something", { model: "m", modelProvider: provider })).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("is fail-soft on an unparsable reply — never a guess", async () => {
    const { provider } = providerThat(() => "maybe? I'm not sure");
    expect(await classifyRuleConflict("a", "b", { model: "m", modelProvider: provider })).toBeUndefined();
  });

  it("is fail-soft when the model throws", async () => {
    const provider = {
      generate: async () => {
        throw new Error("model down");
      }
    };
    expect(await classifyRuleConflict("a", "b", { model: "m", modelProvider: provider })).toBeUndefined();
  });

  it("redacts a secret in the rule text before it reaches the model", async () => {
    const { calls, provider } = providerThat(() => "OK");
    await classifyRuleConflict("my key is sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef", "b", {
      model: "m",
      modelProvider: provider
    });
    expect(calls[0]?.a).not.toContain("sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef");
  });
});

describe("findConflictingRuleIds — O(n) sweep at learn time", () => {
  it("returns only the ids the classifier calls CONFLICT", async () => {
    // The fake decides by CONTENT: a rule is a conflict iff its text contains "clash".
    const { provider } = providerThat((_a, b) => (b.includes("clash") ? "CONFLICT" : "OK"));
    const result = await findConflictingRuleIds(
      "new rule",
      [
        { id: "keep-1", text: "compatible one" },
        { id: "drop-1", text: "this will clash badly" },
        { id: "keep-2", text: "compatible two" },
        { id: "drop-2", text: "another clash" }
      ],
      { model: "m", modelProvider: provider }
    );
    expect([...result].sort()).toEqual(["drop-1", "drop-2"]);
  });

  it("a per-pair failure skips only that pair and never records a conflict on a guess", async () => {
    // "boom" throws; "clash" conflicts; the rest are OK. The thrown pair must be
    // silently skipped, not recorded, not fatal to the sweep.
    const provider = {
      generate: async (request: { messages: readonly { content: string }[] }) => {
        const user = request.messages.find((m) => m.content.startsWith("A: "))?.content ?? "";
        if (user.includes("boom")) {
          throw new Error("model down for this one");
        }
        return { output: user.includes("clash") ? "CONFLICT" : "OK" };
      }
    };
    const result = await findConflictingRuleIds(
      "new rule",
      [
        { id: "boom-1", text: "boom this errors" },
        { id: "drop-1", text: "this will clash" },
        { id: "keep-1", text: "fine" }
      ],
      { model: "m", modelProvider: provider }
    );
    expect([...result]).toEqual(["drop-1"]);
  });

  it("returns [] when nothing conflicts", async () => {
    const { provider } = providerThat(() => "OK");
    const result = await findConflictingRuleIds("new rule", [{ id: "a", text: "x" }, { id: "b", text: "y" }], {
      model: "m",
      modelProvider: provider
    });
    expect(result).toEqual([]);
  });
});
