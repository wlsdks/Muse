/**
 * Per-token risk highlighter for the interactive tool-approval prompt.
 *
 * `classifyDangerousCommand` (dangerous-command.ts) is a whole-command
 * catastrophic/non-catastrophic BOOLEAN gate: it fail-closes a narrow,
 * irreversible set (`rm -rf /`, `dd of=/dev/sdX`, …) and deliberately lets a
 * routine-but-risky command through (a relative `rm -rf ./build`). This
 * module targets the SAME risk vocabulary — force/recursive flags, sensitive
 * paths, destructive verbs — but at the TOKEN level and for a wider set: its
 * job is "make the human NOTICE", not "refuse to run", so it also highlights
 * commands DS-2 intentionally lets pass.
 */

export interface RiskySpan {
  readonly start: number;
  readonly end: number;
  readonly token: string;
  readonly reason: string;
}

// A multi-kilobyte approval-prompt string is already unusual (the caller
// clips each value to 60 chars — see `summarizeToolArgs`); bound the scan so
// a pathological input stays linear-time and never becomes a ReDoS surface.
const MAX_SCAN_LENGTH = 4000;

// Boundary a risky path/flag token can sit after: start of string,
// whitespace, `=` (attached-argument syntax like `of=/dev/disk2`), or a
// quote char — the approval-prompt summary JSON-stringifies array args
// (`args: ["-c","rm -rf /tmp/x"]`), so the real command text sits right
// after a `"`, not after whitespace.
const LEFT_BOUND = "(?:^|[\\s=\"'])";

const SHORT_FLAG_RE = /(?:^|[\s="'])(-(?!-)[A-Za-z]{1,8})\b/gu;
const LONG_FLAG_RE = /(?:^|[\s="'])(--(?:no-preserve-root|for[a-z]*|rec[a-z]*))\b/giu;

// Destructive verbs flagged regardless of target (the human should always
// notice them) vs. chmod/chown, which are only flagged when paired with a
// recursive flag — a plain `chmod 644 file` is routine, not risky.
const VERB_RE = /\b(rm|dd|mkfs(?:\.[a-zA-Z0-9]+)?|wipefs|shred|chmod|chown)\b/gu;
const RECURSIVE_FLAG_NEARBY_RE = /(?:^|\s)(?:-(?!-)[A-Za-z]*[Rr][A-Za-z]*\b|--rec[a-z]*\b)/u;
// Bounded, separator-stopped lookahead window for the chmod/chown recursive check.
const RECURSIVE_LOOKAHEAD_MAX = 200;

const SENSITIVE_TILDE_RE = new RegExp(LEFT_BOUND + "(~\\/(?:\\.ssh|\\.aws|\\.gnupg|\\.config)\\b[^\\s]*)", "gu");
const BARE_TILDE_RE = new RegExp(LEFT_BOUND + "(~)(?=\\s|$)", "gu");
const BARE_ROOT_RE = new RegExp(LEFT_BOUND + "(\\/)(?=\\s|$)", "gu");
const HOME_VAR_RE = new RegExp(LEFT_BOUND + "(\\$\\{?HOME\\}?\\/?[^\\s]*)", "gu");
const SYSTEM_PATH_RE = new RegExp(LEFT_BOUND + "(\\/(?:etc|dev|System|usr|bin|boot|var)\\b[^\\s]*)", "gu");

const VERB_REASON: Readonly<Record<string, string>> = {
  rm: "delete command",
  dd: "raw disk/device command",
  wipefs: "wipe filesystem signatures",
  shred: "irreversible file shred"
};

interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly token: string;
  readonly reason: string;
}

// A destructive verb is only worth flagging when it sits at the START of a
// command — the first word, or immediately after a separator (`;`, `&`,
// `|`, newline, `(`), a `sudo` prefix, or a quote char (the JSON-stringified
// args summary puts the real command right after an opening `"`) — not
// when it merely appears mid-sentence as an argument word elsewhere (`git
// commit -m "remove the old rm helper"` must not flag that `rm`).
function isCommandPosition(text: string, start: number): boolean {
  let i = start;
  while (i > 0 && /\s/u.test(text[i - 1]!)) i--;
  if (i === 0) return true;
  const before = text[i - 1]!;
  if (before === ";" || before === "&" || before === "|" || before === "\n" || before === "(" || before === '"' || before === "'") return true;
  return /(?:^|[;&|(\n]\s*)sudo$/u.test(text.slice(0, i));
}

function tokenStart(matchIndex: number, fullMatch: string, token: string): number {
  return matchIndex + (fullMatch.length - token.length);
}

/**
 * Scan a command / tool-args summary string for risky tokens: destructive
 * force/recursive flags, sensitive filesystem paths, and destructive verbs.
 * Returns non-overlapping spans, left-to-right by start. Pure, synchronous,
 * never throws.
 */
export function identifyRiskyTokens(text: string): readonly RiskySpan[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const scan = text.length > MAX_SCAN_LENGTH ? text.slice(0, MAX_SCAN_LENGTH) : text;
  const candidates: Candidate[] = [];

  for (const m of scan.matchAll(SHORT_FLAG_RE)) {
    const token = m[1]!;
    const letters = token.slice(1).toLowerCase();
    if (letters.includes("r") && letters.includes("f")) {
      const start = tokenStart(m.index!, m[0], token);
      candidates.push({ start, end: start + token.length, token, reason: "recursive force delete flag" });
    }
  }

  for (const m of scan.matchAll(LONG_FLAG_RE)) {
    const token = m[1]!;
    const lower = token.toLowerCase();
    const reason = lower.includes("preserve-root")
      ? "disables the root-delete safety check"
      : lower.startsWith("--for")
        ? "force flag"
        : "recursive flag";
    const start = tokenStart(m.index!, m[0], token);
    candidates.push({ start, end: start + token.length, token, reason });
  }

  for (const m of scan.matchAll(VERB_RE)) {
    const token = m[1]!;
    const start = m.index!;
    if (!isCommandPosition(scan, start)) continue;
    if (token === "chmod" || token === "chown") {
      const windowEnd = Math.min(scan.length, start + token.length + RECURSIVE_LOOKAHEAD_MAX);
      let rest = scan.slice(start + token.length, windowEnd);
      const sepIdx = rest.search(/[;&|\n]/u);
      if (sepIdx !== -1) rest = rest.slice(0, sepIdx);
      if (RECURSIVE_FLAG_NEARBY_RE.test(rest)) {
        candidates.push({
          start,
          end: start + token.length,
          token,
          reason: `recursive ${token === "chmod" ? "permission" : "ownership"} change`
        });
      }
      continue;
    }
    candidates.push({ start, end: start + token.length, token, reason: VERB_REASON[token] ?? "filesystem format command" });
  }

  for (const re of [SENSITIVE_TILDE_RE, HOME_VAR_RE, SYSTEM_PATH_RE, BARE_TILDE_RE, BARE_ROOT_RE]) {
    for (const m of scan.matchAll(re)) {
      const token = m[1]!;
      const start = tokenStart(m.index!, m[0], token);
      candidates.push({ start, end: start + token.length, token, reason: "sensitive path" });
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: RiskySpan[] = [];
  let lastEnd = -1;
  for (const c of candidates) {
    if (c.start < lastEnd) continue;
    result.push(c);
    lastEnd = c.end;
  }
  return result;
}

const ANSI_BOLD_RED = "\x1b[1;31m";
const ANSI_RESET = "\x1b[0m";

/**
 * Wrap each risky span in `text` in bold-red ANSI. This is TRUSTED
 * styling applied AFTER the caller has already sanitized `text` (stripped
 * untrusted terminal control bytes, redacted secrets) — never call it on raw
 * untrusted content. Non-risky text (and a string with no risky tokens) is
 * returned unchanged.
 */
export function emphasizeRiskyTokens(text: string): string {
  const spans = identifyRiskyTokens(text);
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.start);
    out += ANSI_BOLD_RED + text.slice(span.start, span.end) + ANSI_RESET;
    cursor = span.end;
  }
  out += text.slice(cursor);
  return out;
}
