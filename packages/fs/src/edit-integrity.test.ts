import { describe, expect, it } from "vitest";

import { checkEditIntegrity } from "./edit-integrity.js";

// Edit-integrity gate (eval:multifile-fix residual): fail-close on a destructive
// edit (deletes a definition / unbalances delimiters) so a botched small-model
// edit becomes a guided retry, not a corrupted file. REGRESSION-only.

describe("checkEditIntegrity — definition-deletion guard", () => {
  it("rejects deleting a function definition (the multifile-fix run-2 failure)", () => {
    const before = "export function multiply(a, b) {\n  return a + b;\n}\n";
    const after = "";
    const r = checkEditIntegrity(before, after);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("multiply");
  });

  it("accepts changing a function BODY (the legit fix: + -> *)", () => {
    const before = "export function multiply(a, b) {\n  return a + b;\n}\n";
    const after = "export function multiply(a, b) {\n  return a * b;\n}\n";
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("rejects deleting a const/arrow definition", () => {
    const before = "const multiply = (a, b) => a + b;\n";
    const after = "\n";
    const r = checkEditIntegrity(before, after);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("multiply");
  });

  it("rejects deleting a class definition", () => {
    const before = "export class Calc {\n  add(a, b) { return a + b; }\n}\n";
    const after = "// removed\n";
    expect(checkEditIntegrity(before, after).ok).toBe(false);
  });

  it("accepts ADDING a new definition (only removals are flagged)", () => {
    const before = "function a() { return 1; }\n";
    const after = "function a() { return 1; }\nfunction b() { return 2; }\n";
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("names every removed definition in the reason", () => {
    const before = "function alpha(){}\nfunction beta(){}\n";
    const after = "function alpha(){}\n";
    const r = checkEditIntegrity(before, after);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("beta");
    expect(r.reason).not.toContain("alpha");
  });

  it("does not flag edits to a file with no definitions (prose)", () => {
    const before = "# My notes\n\nBuy milk and eggs.\n";
    const after = "# My notes\n\nBuy milk, eggs, and bread.\n";
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("treats a rename as a deletion of the old name (conservative — agent should keep+edit)", () => {
    const before = "function multiply(a, b) { return a * b; }\n";
    const after = "function mult(a, b) { return a * b; }\n";
    expect(checkEditIntegrity(before, after).ok).toBe(false);
  });
});

describe("checkEditIntegrity — delimiter-balance guard", () => {
  it("rejects an edit that unbalances braces", () => {
    const before = "if (x) {\n  doThing();\n}\n";
    const after = "if (x) {\n  doThing();\n";
    const r = checkEditIntegrity(before, after);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("unbalanced");
  });

  it("accepts a balanced edit", () => {
    const before = "call(a, b);\n";
    const after = "call(a, b, c);\n";
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("does not engage when the ORIGINAL was already unbalanced (regression-only)", () => {
    // No definitions, original not balanced → neither check fires.
    const before = "foo(\n";
    const after = "foo(\nbar(\n";
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("ignores a brace inside a string literal (string-stripped balance)", () => {
    const before = 'const s = "ok";\n';
    const after = 'const s = "a { unmatched brace in a string";\n';
    // `s` is still defined, and the brace lives inside a string → balanced.
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("ignores a brace inside a line comment", () => {
    const before = "let n = 1;\n";
    const after = "let n = 1; // note: } is fine here\n";
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("ignores delimiters inside a block comment", () => {
    const before = "let n = 1;\n";
    const after = "/* a ) bracket [ in a comment */\nlet n = 1;\n";
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("handles escaped quotes inside a string", () => {
    const before = 'let q = "x";\n';
    const after = 'let q = "she said \\"{\\" loudly";\n';
    expect(checkEditIntegrity(before, after).ok).toBe(true);
  });

  it("rejects a mismatched closer (])", () => {
    const before = "arr[0];\n";
    const after = "arr[0);\n";
    expect(checkEditIntegrity(before, after).ok).toBe(false);
  });
});
