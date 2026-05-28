import { describe, expect, it } from "vitest";

import { composeChatSystemContent, selectPlaybookSection } from "./commands-ask.js";

describe("composeChatSystemContent — ACE [Learned Strategies] into the chat-only ask path", () => {
  it("prepends the playbook block before the system prompt", () => {
    const out = composeChatSystemContent("You are Muse.", "[Learned Strategies]\n- keep answers under 4 sentences");
    expect(out).toBe("[Learned Strategies]\n- keep answers under 4 sentences\n\nYou are Muse.");
  });

  it("is a no-op when there are no learned strategies (prompt unchanged)", () => {
    expect(composeChatSystemContent("You are Muse.", undefined)).toBe("You are Muse.");
    expect(composeChatSystemContent("You are Muse.", "")).toBe("You are Muse.");
    expect(composeChatSystemContent("You are Muse.", "   ")).toBe("You are Muse.");
  });
});

describe("selectPlaybookSection — relevance-ranked top-K into the chat-only ask block (ReasoningBank 2509.25140)", () => {
  const bank = [
    { tag: "email", text: "keep work emails under 4 sentences" },
    { tag: "scheduling", text: "when rescheduling, default to the next business day" }
  ];

  it("injects only the relevant strategy when topK is smaller than the bank", () => {
    const out = selectPlaybookSection(bank, "draft an email reply to Sam", 1) ?? "";
    expect(out).toContain("under 4 sentences");
    expect(out).not.toContain("next business day");
  });

  it("keeps the whole small bank, most-relevant first", () => {
    const out = selectPlaybookSection(bank, "push the meeting to a business day", 6) ?? "";
    expect(out).toContain("next business day");
    expect(out).toContain("under 4 sentences");
    expect(out.indexOf("business day")).toBeLessThan(out.indexOf("4 sentences"));
  });

  it("no entries → undefined (no block injected)", () => {
    expect(selectPlaybookSection([], "anything", 6)).toBeUndefined();
  });
});
