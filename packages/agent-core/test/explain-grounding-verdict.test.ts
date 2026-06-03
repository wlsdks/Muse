import { describe, expect, it } from "vitest";

import { explainGroundingVerdict, verifyGrounding, type KnowledgeMatch } from "../src/knowledge-recall.js";

const match = (cosine: number, text: string, source = "notes/n.md"): KnowledgeMatch => ({ cosine, score: cosine, source, text });

describe("explainGroundingVerdict — the muse ask --why refusal trace", () => {
  it("is SILENT on a grounded answer (happy path, not a debug firehose)", () => {
    const v = verifyGrounding("the vpn mtu is 1380", [match(0.72, "the office vpn uses mtu 1380")], "what mtu for the vpn");
    expect(v.verdict).toBe("grounded");
    expect(explainGroundingVerdict(v)).toEqual([]);
  });

  it("names the CONFIDENCE criterion with the measured cosine vs threshold when nothing was retrieved", () => {
    const v = verifyGrounding("the capital of mars is olympus", [], "what is the capital of mars");
    expect(v.verdict).toBe("ungrounded");
    const lines = explainGroundingVerdict(v, { topCosine: 0.42 });
    expect(lines[0]).toContain("no notes came close");
    expect(lines[0]).toContain("best match 0.42, I need 0.55");
    expect(lines[0]).toContain("confidence criterion");
  });

  it("names the COVERAGE criterion with the measured percent when the answer drifts off the evidence", () => {
    // Confident retrieval (cosine 0.72) but the answer's words aren't in the evidence → coverage 0.
    const v = verifyGrounding("completely unrelated giraffe astronomy trivia", [match(0.72, "the office vpn uses mtu 1380")], "what mtu for the vpn");
    expect(v.verdict).toBe("ungrounded");
    const lines = explainGroundingVerdict(v);
    expect(lines.some((l) => l.includes("coverage criterion") && l.includes("%"))).toBe(true);
    // confidence was fine (confident) → no confidence line.
    expect(lines.some((l) => l.includes("confidence criterion"))).toBe(false);
  });

  it("names the CITATION criterion and lists the fabricated source", () => {
    const v = verifyGrounding("the answer [from ghost.md]", [match(0.72, "the office vpn uses mtu 1380", "notes/real.md")], "what mtu");
    expect(v.verdict).toBe("ungrounded");
    const lines = explainGroundingVerdict(v);
    expect(lines.some((l) => l.includes("citation criterion") && l.includes("ghost.md"))).toBe(true);
  });

  it("flags a weak (ambiguous-retrieval) answer as low-confidence, not a hard failure", () => {
    const v = verifyGrounding("the vpn mtu is 1380", [match(0.42, "the office vpn uses mtu 1380")], "what mtu for the vpn");
    expect(v.verdict).toBe("weak");
    const lines = explainGroundingVerdict(v, { topCosine: 0.42 });
    expect(lines[0]).toContain("loosely related");
    expect(lines[0]).toContain("confidence criterion (low)");
  });

  it("respects custom thresholds in the rendered explanation", () => {
    const v = verifyGrounding("the capital of mars is olympus", [], "what is the capital of mars");
    const lines = explainGroundingVerdict(v, { confidentAt: 0.7, topCosine: 0.5 });
    expect(lines[0]).toContain("best match 0.50, I need 0.70");
  });
});
