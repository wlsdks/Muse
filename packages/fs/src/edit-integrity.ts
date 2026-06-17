/**
 * Edit-integrity verification — fail-close on a destructive / broken file_edit
 * BEFORE it is written, so a small model's botched edit becomes a guided retry
 * instead of a silently corrupted file.
 *
 * The grounding edge applied to the WRITE path: read-before-edit grounds WHAT
 * the model may touch; this grounds WHAT the edit may do to it. An actuator that
 * leaves a file broken is fabrication-adjacent — "Muse shows its work" must mean
 * it does not silently delete or syntactically break code.
 *
 * Observed (eval:multifile-fix): with the right tool now selected, the dominant
 * remaining failure is the 12B DELETING the function it was asked to fix
 * (`multiply` → "") rather than editing its body — a destructive edit, not a
 * tool-selection miss. These checks are REGRESSION-only (they fire only when the
 * edit makes a previously-good property bad), so prose and ordinary edits are
 * never flagged:
 *
 *   1. Definition-deletion — a top-level `function`/`class`/`const|let|var` NAME
 *      defined in the original that the edited content no longer defines. Fixing
 *      a function means changing its body, never removing the definition.
 *   2. Delimiter-balance regression — the original had balanced ()[]{} and the
 *      edit left them unbalanced (a cheap broken-syntax proxy). Strings and
 *      comments are stripped first so a literal brace in a string is not counted.
 *
 * Deterministic, content-only; no model call. Opt-in via
 * `FsWriteToolsOptions.checkEditIntegrity` (the agent write path turns it on).
 */

export interface EditIntegrityResult {
  readonly ok: boolean;
  readonly reason?: string;
}

// (export | default | async) function[*] NAME · class NAME · (const|let|var) NAME.
// Captures the declared identifier; method shorthand inside a class body (no
// leading keyword) is intentionally NOT matched — only top-level definitions.
const DEFINITION_RE = /(?:\bexport\s+)?(?:\bdefault\s+)?(?:\basync\s+)?\b(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gu;

function definedNames(text: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(DEFINITION_RE)) {
    if (match[1]) {
      names.add(match[1]);
    }
  }
  return names;
}

const CLOSER: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };

/**
 * Replace the CONTENT of string/char/template literals and comments with spaces
 * (length-preserving) so a brace inside `"{"` or `// {` is not counted by the
 * balance check. Approximate (template `${}` interpolation is treated as inert
 * string), which only makes the check MORE conservative — it can miss a real
 * imbalance, never invent one.
 */
function stripStringsAndComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function delimitersBalanced(text: string): boolean {
  const stack: string[] = [];
  for (const ch of stripStringsAndComments(text)) {
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch);
    } else if (ch === ")" || ch === "]" || ch === "}") {
      const open = stack.pop();
      if (open === undefined || CLOSER[open] !== ch) {
        return false;
      }
    }
  }
  return stack.length === 0;
}

export function checkEditIntegrity(original: string, edited: string): EditIntegrityResult {
  const before = definedNames(original);
  if (before.size > 0) {
    const after = definedNames(edited);
    const removed = [...before].filter((name) => !after.has(name));
    if (removed.length > 0) {
      const list = removed.map((name) => `\`${name}\``).join(", ");
      return {
        ok: false,
        reason:
          `edit removed the definition(s) of ${list} — to fix code, change the body, do not delete the ` +
          "definition. Keep the symbol and edit only the part that is wrong."
      };
    }
  }

  if (delimitersBalanced(original) && !delimitersBalanced(edited)) {
    return {
      ok: false,
      reason:
        "edit left the parentheses/brackets/braces unbalanced (likely broken syntax) — re-check that every " +
        "( ) [ ] { } stays paired."
    };
  }

  return { ok: true };
}
