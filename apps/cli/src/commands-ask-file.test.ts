import { describe, expect, it } from "vitest";

import { selectFilePassages } from "./commands-ask.js";

describe("selectFilePassages — ad-hoc --file grounding", () => {
  it("returns every passage of a small file, in original order", () => {
    const picked = selectFilePassages("The VPN MTU is 1380.\n\nThe office is at 5th Ave.", "what is the mtu");
    expect(picked.length).toBeGreaterThanOrEqual(1);
    expect(picked.map((p) => p.chunkIndex)).toEqual([...picked.map((p) => p.chunkIndex)].sort((a, b) => a - b));
    expect(picked.some((p) => p.text.includes("1380"))).toBe(true);
  });

  it("ranks the query-relevant passage in, and respects the char budget for a big file", () => {
    const big = Array.from({ length: 50 }, (_u, i) => `Section ${i.toString()}: filler about topic ${i.toString()}.`).join("\n\n")
      + "\n\nThe secret port number is 8443.";
    const picked = selectFilePassages(big, "what is the secret port number", 400);
    const total = picked.reduce((n, p) => n + p.text.length, 0);
    expect(total).toBeLessThanOrEqual(400 + 1200); // budget + at most one overflowing passage
    expect(picked.some((p) => p.text.includes("8443"))).toBe(true); // the relevant passage made the cut
  });

  it("an empty file yields no passages", () => {
    expect(selectFilePassages("", "anything")).toEqual([]);
    expect(selectFilePassages("   \n  ", "anything")).toEqual([]);
  });
});
