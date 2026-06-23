/**
 * Deterministic 1-line semantic summary of a tool result.
 *
 * When a large tool output is truncated before it lands in the
 * conversation, head+tail elision keeps raw bytes but loses the
 * *gist* — "did the command pass?", "how many results?". A poisoned
 * or noisy middle is dropped silently. This module produces a
 * deterministic, code-derived one-liner ("terminal: exit 0 · 120
 * lines", "search: 37 results") that the runtime folds into the
 * elision marker, so a compacted/truncated tool result still SHOWS
 * what it did. No LLM call, no I/O — pure string inspection, so it
 * is auditable and cannot fabricate.
 *
 * Inspired by hermes' pre-LLM tool-result summary patterns
 * (reference-only); Muse's own implementation, content-derived
 * (the truncation seam has the tool name + output, not the args).
 */

export interface ToolResultSummaryOptions {
  /** Max length of the returned summary; longer is clipped with an ellipsis. Default 80. */
  readonly maxLen?: number;
}

type ToolDomain =
  | "git"
  | "terminal"
  | "write"
  | "read"
  | "search"
  | "web"
  | "calendar"
  | "notes"
  | "tasks"
  | "memory"
  | "generic";

/**
 * Return a deterministic 1-line summary of a tool result, or `null`
 * when the output is empty (nothing worth summarizing). The summary
 * never includes the raw bulk — only counts, exit codes, and a short
 * leading title where one is clearly present.
 */
export function summarizeToolResult(
  toolName: string,
  output: string,
  options: ToolResultSummaryOptions = {}
): string | null {
  const text = output ?? "";
  if (text.trim().length === 0) {
    return null;
  }
  const maxLen = options.maxLen ?? 80;
  const domain = classifyToolDomain(toolName);
  const summary = buildSummary(domain, text);
  return summary === null ? null : clip(summary, maxLen);
}

// Domain-noun families are checked before verb families so a tool
// like `muse.notes.list` reads as notes (not search), while a bare
// `web.search` reads as web (not search). Matching is on whole
// tokens — splitting on non-alphanumerics — so a verb never matches
// a substring buried inside an unrelated word (e.g. "cat" inside
// "frobnicate"). First family with a token hit wins.
const DOMAIN_FAMILIES: ReadonlyArray<readonly [ToolDomain, readonly string[]]> = [
  ["git", ["git"]],
  ["calendar", ["calendar"]],
  ["notes", ["note", "notes"]],
  ["tasks", ["task", "tasks", "todo", "reminder"]],
  ["memory", ["memory", "recall", "knowledge", "history", "remember"]],
  ["terminal", ["terminal", "shell", "bash", "exec", "command", "process", "run"]],
  ["web", ["web", "fetch", "http", "url", "scrape", "crawl", "browser", "navigate"]],
  ["write", ["write", "edit", "create", "append", "patch", "save"]],
  ["read", ["read", "cat", "open", "view"]],
  ["search", ["search", "grep", "glob", "find", "list", "ls", "query"]]
];

function classifyToolDomain(toolName: string): ToolDomain {
  const tokens = new Set((toolName ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  for (const [domain, needles] of DOMAIN_FAMILIES) {
    if (needles.some((n) => tokens.has(n))) {
      return domain;
    }
  }
  return "generic";
}

function buildSummary(domain: ToolDomain, text: string): string | null {
  const lines = countLines(text);
  const chars = fmtChars(text.length);

  switch (domain) {
    case "terminal": {
      const exit = extractExitCode(text);
      if (exit !== null) {
        const status = exit === 0 ? `exit 0` : `exit ${exit} (error)`;
        return `terminal: ${status} · ${lines} lines`;
      }
      return `terminal: ${lines} lines · ${chars}`;
    }
    case "git": {
      const first = firstMeaningfulLine(text);
      return first ? `git: ${first}` : `git: ${lines} lines`;
    }
    case "write":
      return `write: ${chars}`;
    case "read":
      return `read: ${lines} lines · ${chars}`;
    case "search":
      return `search: ${countNonEmptyLines(text)} results`;
    case "web": {
      const title = shortTitle(text);
      return title ? `web: ${title} · ${chars}` : `web: ${chars}`;
    }
    case "calendar":
      return `calendar: ${countNonEmptyLines(text)} items`;
    case "notes":
      return `notes: ${countNonEmptyLines(text)} items`;
    case "tasks":
      return `tasks: ${countNonEmptyLines(text)} items`;
    case "memory":
      return `memory: ${countNonEmptyLines(text)} entries`;
    case "generic":
      return `${lines} lines · ${chars}`;
    default:
      return null;
  }
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

function countNonEmptyLines(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) {
    if (line.trim().length > 0) n++;
  }
  return n;
}

function firstMeaningfulLine(text: string): string | null {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return null;
}

/**
 * A leading line is treated as a "title" only when it is genuinely
 * short and there is more than one line — otherwise a single blob of
 * filler would become a meaningless, oversized title. Guards the web
 * summary against dumping raw content into the marker.
 */
function shortTitle(text: string): string | null {
  if (countLines(text) < 2) return null;
  const first = firstMeaningfulLine(text);
  if (first === null) return null;
  return first.length <= 60 ? first : null;
}

const EXIT_PATTERNS: readonly RegExp[] = [
  /\bexit code[:=]?\s*(\d{1,3})\b/i,
  /\bexit(?:ed|s)?\s+(?:with\s+)?(?:code\s+)?(\d{1,3})\b/i,
  /\breturn(?:ed)?\s+code[:=]?\s*(\d{1,3})\b/i
];

function extractExitCode(text: string): number | null {
  for (const re of EXIT_PATTERNS) {
    const m = re.exec(text);
    if (m && m[1] !== undefined) {
      return Number(m[1]);
    }
  }
  return null;
}

function fmtChars(n: number): string {
  if (n < 1000) return `${n} chars`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k chars`;
  return `${(n / 1_000_000).toFixed(1)}M chars`;
}

function clip(text: string, maxLen: number): string {
  if (maxLen <= 1) return text.slice(0, Math.max(0, maxLen));
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
}
