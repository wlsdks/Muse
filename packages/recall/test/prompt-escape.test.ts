import { describe, expect, it } from "vitest";

import { stripGroundingFences } from "../src/index.js";

describe("stripGroundingFences", () => {
  it("removes a leaked <<end>> closer the model echoed", () => {
    expect(stripGroundingFences("Here is the answer.\n<<end>>")).toBe("Here is the answer.\n");
  });

  it("removes opening fence headers of every kind", () => {
    expect(stripGroundingFences("<<memory 1 — diet>>")).toBe("");
    expect(stripGroundingFences("<<note 2 — vpn.md>>")).toBe("");
    expect(stripGroundingFences("<<task 3 — t_9>>")).toBe("");
    expect(stripGroundingFences("<<session 1 — s1 (score 0.42)>>")).toBe("");
  });

  it("strips a whole echoed block's fences while keeping the content text", () => {
    const echoed = "<<memory 1 — diet>>\nYou are vegetarian.\n<<end>>";
    expect(stripGroundingFences(echoed)).toBe("\nYou are vegetarian.\n");
  });

  it("leaves legitimate answer text with `<<` untouched (bit-shift, C++, TODO)", () => {
    expect(stripGroundingFences("compute 1 << 2 then 3")).toBe("compute 1 << 2 then 3");
    expect(stripGroundingFences("cout << note << endl;")).toBe("cout << note << endl;");
    expect(stripGroundingFences("see <<TODO>> below")).toBe("see <<TODO>> below");
  });

  it("is byte-identical when there is no fence tag, and idempotent", () => {
    const plain = "A normal grounded answer [from notes.md].";
    expect(stripGroundingFences(plain)).toBe(plain);
    const once = stripGroundingFences("x <<end>> y");
    expect(stripGroundingFences(once)).toBe(once);
  });
});
