import { isAbsolute, join } from "node:path";

import { describe, expect, it } from "vitest";

import { relativizeNoteSource } from "./commands-ask.js";

describe("relativizeNoteSource — gate, verdict, and receipt cite the SAME source form", () => {
  const notesDir = "/home/u/.muse/notes";

  it("relativizes an absolute note path to the name the model is shown and cites", () => {
    // The grounding verdict previously validated the answer's `[from q3.md]`
    // citation against the RAW absolute path and falsely flagged a correct
    // answer "treat as unverified". This is the form it must use instead.
    expect(relativizeNoteSource(join(notesDir, "q3.md"), notesDir)).toBe("q3.md");
    expect(relativizeNoteSource(join(notesDir, "projects", "vpn.md"), notesDir)).toBe(join("projects", "vpn.md"));
  });

  it("leaves an already-relative source untouched (test corpora pass short names)", () => {
    expect(relativizeNoteSource("policy-2025.pdf", notesDir)).toBe("policy-2025.pdf");
    expect(relativizeNoteSource("notes/lease.md", notesDir)).toBe("notes/lease.md");
  });

  it("never returns an absolute path for a note under the notes dir (so citationValidity can match)", () => {
    const out = relativizeNoteSource(join(notesDir, "lease.md"), notesDir);
    expect(isAbsolute(out)).toBe(false);
  });
});
