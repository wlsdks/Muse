import type { KnowledgeMatch } from "@muse/agent-core";
import { describe, expect, it } from "vitest";

import { isChatGroundedSuccess } from "../src/chat-grounding.js";
import { chatResolveWeakness } from "../src/chat-repl.js";

const match = (text: string): KnowledgeMatch => ({ score: 1, source: "n.md", text });

describe("isChatGroundedSuccess — only a genuine grounded answer resolves a weakness (ask parity)", () => {
  const base = { answer: "The office VPN MTU is 1400.", matches: [match("The office VPN MTU is 1400.")], refusal: false, unbackedAction: false };

  it("true for a supported answer with real evidence (axis null + matches > 0)", () => {
    expect(isChatGroundedSuccess(base)).toBe(true);
  });

  it("false for a refusal, an unbacked action, or an answer with NO evidence (never a false resolve)", () => {
    expect(isChatGroundedSuccess({ ...base, refusal: true })).toBe(false);
    expect(isChatGroundedSuccess({ ...base, unbackedAction: true })).toBe(false);
    expect(isChatGroundedSuccess({ ...base, matches: [] })).toBe(false);
  });
});

describe("chatResolveWeakness — best-effort BKT resolve via the injected ledger writer", () => {
  it("resolves the asked topic through the injected recordWeaknessResolved", async () => {
    const calls: { file: string; message: string }[] = [];
    await chatResolveWeakness("what's my office vpn mtu?", {
      recordWeaknessResolved: async (file: string, message: string) => { calls.push({ file, message }); },
      weaknessesFile: "w.json"
    });
    expect(calls).toEqual([{ file: "w.json", message: "what's my office vpn mtu?" }]);
  });

  it("swallows a throwing resolver (a ledger write never breaks chat)", async () => {
    await expect(chatResolveWeakness("x", {
      recordWeaknessResolved: async () => { throw new Error("ledger down"); },
      weaknessesFile: "w"
    })).resolves.toBeUndefined();
  });
});
