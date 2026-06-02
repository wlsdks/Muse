import { classifyCasualPrompt } from "@muse/agent-core";
import { describe, expect, it } from "vitest";

import { CASUAL_RESPONSES } from "./commands-ask.js";

describe("CASUAL_RESPONSES — clean conversational replies for a social prompt", () => {
  it("has a reply for every kind the classifier produces", () => {
    for (const q of ["hi", "thanks", "bye"]) {
      const kind = classifyCasualPrompt(q);
      expect(kind).not.toBeNull();
      expect(CASUAL_RESPONSES[kind!]).toBeTruthy();
    }
  });

  it("carries NO citation-like token — the whole point is to skip the grounding machinery, never re-introduce it", () => {
    for (const reply of Object.values(CASUAL_RESPONSES)) {
      expect(reply.length).toBeGreaterThan(0);
      expect(reply).not.toMatch(/\[(from|action|event|task|reminder|contact|command|session|feed)\b/u);
    }
  });
});
