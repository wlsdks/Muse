import { describe, expect, it } from "vitest";

import type { KnowledgeMatch } from "@muse/agent-core";

import { groundingVerdictNotice } from "./commands-ask.js";

const match = (source: string, text: string, cosine: number): KnowledgeMatch => ({
  cosine,
  score: cosine,
  source,
  text
});

describe("groundingVerdictNotice — output-side rubric verdict on the ask wedge", () => {
  it("returns undefined for a grounded answer (claims backed by confident evidence)", () => {
    const matches = [match("notes/vpn.md", "The office VPN needs MTU 1380 on wg0 to stop handshake drops.", 0.72)];
    expect(groundingVerdictNotice("Set the VPN MTU to 1380 on wg0 [from notes/vpn.md].", matches, "what MTU for the office VPN")).toBeUndefined();
  });

  it("warns when a confident retrieval is followed by an answer whose claims the evidence does not support", () => {
    const matches = [match("notes/vpn.md", "The office VPN needs MTU 1380 on wg0.", 0.72)];
    const notice = groundingVerdictNotice(
      "Your dentist appointment is Tuesday at 3pm and the rent is due Friday.",
      matches,
      "what MTU for the office VPN"
    );
    expect(notice).toBeDefined();
    expect(notice).toContain("Grounding check");
  });

  it("stays silent on an honest refusal (the refusal already asserts no grounded claim — no double warning)", () => {
    expect(groundingVerdictNotice("I'm not sure — nothing in your notes covers that.", [], "when is my flight")).toBeUndefined();
  });
});
