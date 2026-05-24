import { describe, expect, it } from "vitest";

import { parseInputHistory } from "./chat-input-history.js";

describe("parseInputHistory", () => {
  it("returns oldest→newest non-blank entries, drops blanks, strips CRLF", () => {
    expect(parseInputHistory("what's due today?\r\n\n  \nadd milk\n")).toEqual([
      "what's due today?",
      "add milk"
    ]);
  });
  it("caps to the most recent N", () => {
    const raw = Array.from({ length: 10 }, (_v, i) => `q${i}`).join("\n");
    expect(parseInputHistory(raw, 3)).toEqual(["q7", "q8", "q9"]);
  });
  it("empty input → empty history", () => {
    expect(parseInputHistory("")).toEqual([]);
    expect(parseInputHistory("   \n  \n")).toEqual([]);
  });
});
