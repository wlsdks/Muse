/**
 * Write-tier `@muse/fs` tools — `file_write`, `file_edit`,
 * `file_multi_edit`. All are `risk: "write"` and route through TWO
 * fail-close guards: the path sandbox (`fs-path-safety`) and an INJECTED
 * approval gate (no gate ⇒ no write). The gate is shown the exact draft
 * (path + summary + preview) and a deny / throw / timeout means the write
 * does NOT happen.
 *
 * No partial side-effects (agent-testing.md #3): every edit computes and
 * validates the FULL next file content first, asks the gate once, and only
 * then writes once. An invalid edit (old_string missing/ambiguous) or a
 * denied gate leaves the file byte-for-byte unchanged.
 */

import { constants as fsConstants } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname } from "node:path";

import type { JsonObject } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

import { isPathSafetyError, resolvePolicy, resolveSafePath, type PathSafetyOptions, type ResolvedPolicy } from "./fs-path-safety.js";

const PREVIEW_CHARS = 400;

export interface FsWriteDraft {
  readonly action: "write" | "edit" | "multi_edit";
  readonly path: string;
  /** Human-readable one-liner, e.g. "Overwrite todo.md" / "Apply 3 edits to config.ts". */
  readonly summary: string;
  /** A short preview of the new content (capped) for the confirm prompt. */
  readonly preview: string;
}

export interface FsWriteApprovalDecision {
  readonly approved: boolean;
  readonly reason?: string;
}

/** Presents the exact write draft to the user; returns approve/deny. Fail-close. */
export type FsWriteApprovalGate = (draft: FsWriteDraft) => Promise<FsWriteApprovalDecision> | FsWriteApprovalDecision;

export interface FsWriteToolsOptions extends PathSafetyOptions {
  /** REQUIRED — no gate means no write can ever happen (fail-close). */
  readonly approvalGate: FsWriteApprovalGate;
}

export interface FsEditSpec {
  readonly old_string: string;
  readonly new_string: string;
  readonly replace_all?: boolean;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

type EditOutcome = { readonly ok: true; readonly content: string; readonly fuzzy?: boolean } | { readonly ok: false; readonly reason: string };

const UNICODE_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/gu, "-"],
  [/[\u2018\u2019\u201A\u201B]/gu, "'"],
  [/[\u201C\u201D\u201E\u201F]/gu, '"'],
  [/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/gu, " "]
]

function foldUnicode(line: string): string {
  let out = line.trim();
  for (const [pattern, replacement] of UNICODE_FOLDS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Progressive line-block relaxations, exact-first — the same ladder Codex's
 * `seek_sequence` uses so a recalled snippet still lands when it differs from
 * disk only by trailing whitespace, indentation, or typographic punctuation.
 * Level 0 (identity) is covered by the exact substring pass, so the fuzzy
 * fallback starts at trailing-whitespace.
 */
const LINE_RELAXATIONS: ReadonlyArray<(line: string) => string> = [
  (line) => line.replace(/\s+$/u, ""),
  (line) => line.trim(),
  foldUnicode
];

/**
 * When exact matching fails, find a UNIQUE contiguous block of file lines that
 * matches `oldString`'s lines under the most exact relaxation that yields any
 * match. Returns char offsets into `content`, or a reason. Uniqueness is
 * required at each level (we never guess a location), keeping Muse's
 * no-partial-side-effects posture stricter than Codex's first-match seek.
 */
function findFuzzyBlock(
  content: string,
  oldString: string
): { readonly ok: true; readonly start: number; readonly end: number } | { readonly ok: false; readonly reason: "none" | "ambiguous" } {
  const contentLines = content.split("\n");
  let pattern = oldString.split("\n");
  if (pattern.length > 1 && pattern[pattern.length - 1] === "") {
    pattern = pattern.slice(0, -1);
  }
  if (pattern.length === 0 || pattern.length > contentLines.length) {
    return { ok: false, reason: "none" };
  }
  for (const relax of LINE_RELAXATIONS) {
    const relaxedPattern = pattern.map((line) => relax(line));
    const hits: number[] = [];
    for (let i = 0; i + pattern.length <= contentLines.length; i += 1) {
      let matched = true;
      for (let j = 0; j < pattern.length; j += 1) {
        if (relax(contentLines[i + j]!) !== relaxedPattern[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        hits.push(i);
      }
    }
    if (hits.length === 1) {
      const startLine = hits[0]!;
      let start = 0;
      for (let k = 0; k < startLine; k += 1) {
        start += contentLines[k]!.length + 1;
      }
      const matchedText = contentLines.slice(startLine, startLine + pattern.length).join("\n");
      return { end: start + matchedText.length, ok: true, start };
    }
    if (hits.length > 1) {
      return { ok: false, reason: "ambiguous" };
    }
  }
  return { ok: false, reason: "none" };
}

/** Apply ONE edit to `content`, validating uniqueness. Pure — never touches disk. */
export function applyEdit(content: string, spec: FsEditSpec): EditOutcome {
  if (spec.old_string.length === 0) {
    return { ok: false, reason: "old_string must not be empty" };
  }
  if (spec.old_string === spec.new_string) {
    return { ok: false, reason: "old_string and new_string are identical — nothing to change" };
  }
  const matches = countOccurrences(content, spec.old_string);
  if (matches > 1 && spec.replace_all !== true) {
    return { ok: false, reason: `old_string matches ${matches.toString()} places — pass replace_all or use a longer, unique old_string` };
  }
  if (matches >= 1) {
    const next = spec.replace_all === true
      ? content.split(spec.old_string).join(spec.new_string)
      : content.replace(spec.old_string, spec.new_string);
    return { content: next, ok: true };
  }
  // Exact match failed — fall back to a whitespace/punctuation-tolerant
  // line-block match (replace_all has no meaning for a single unique block).
  const fuzzy = findFuzzyBlock(content, spec.old_string);
  if (!fuzzy.ok) {
    return fuzzy.reason === "ambiguous"
      ? { ok: false, reason: `old_string fuzzily matches multiple places — use a longer, unique old_string` }
      : { ok: false, reason: `old_string not found: ${JSON.stringify(spec.old_string.slice(0, 80))}` };
  }
  return { content: content.slice(0, fuzzy.start) + spec.new_string + content.slice(fuzzy.end), fuzzy: true, ok: true };
}

/** Apply edits in order on the evolving content; the first failure aborts (atomic). */
export function applyEdits(content: string, edits: readonly FsEditSpec[]): EditOutcome {
  let current = content;
  for (let index = 0; index < edits.length; index += 1) {
    const outcome = applyEdit(current, edits[index]!);
    if (!outcome.ok) {
      return { ok: false, reason: `edit ${(index + 1).toString()}: ${outcome.reason}` };
    }
    current = outcome.content;
  }
  return { content: current, ok: true };
}

function refusal(error: unknown, path: string): JsonObject {
  if (isPathSafetyError(error)) {
    return { path, reason: error.message, refused: true, written: false };
  }
  // A symlink at the target (caught atomically by O_NOFOLLOW at write time) is a
  // refusal, not a generic IO error — it's the fail-close on a dangling-symlink /
  // TOCTOU escape that the path check alone can't see.
  if ((error as NodeJS.ErrnoException).code === "ELOOP") {
    return { path, reason: `'${path}' is a symlink — refused (a symlink target could escape the sandbox)`, refused: true, written: false };
  }
  return { path, reason: error instanceof Error ? error.message : String(error), written: false };
}

/**
 * Write `content` to an already-sandbox-approved path WITHOUT following a
 * symlink at the leaf. `O_NOFOLLOW` makes the kernel reject (ELOOP) a final
 * component that is a symlink — atomically, at open time — which closes the
 * dangling-symlink and TOCTOU escapes that a path-string check before a plain
 * `writeFile` cannot (the leaf can be a symlink the realpath ancestor-walk never
 * resolved, or one swapped in during the approval-gate await window).
 */
async function writeFileNoFollow(safePath: string, content: string): Promise<void> {
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
  const handle = await open(safePath, flags, 0o644);
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}

/** Read an existing file without following a symlink leaf (ELOOP on a symlink). */
async function readFileNoFollow(safePath: string): Promise<string> {
  const handle = await open(safePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export function createFileWriteTool(options: FsWriteToolsOptions, policyPromise?: Promise<ResolvedPolicy>): MuseTool {
  const policy = policyPromise ?? resolvePolicy(options);
  return {
    definition: {
      description:
        "Create a NEW file or fully OVERWRITE an existing one with the given content. Use only when the user " +
        "clearly asks to create / save / replace a whole file (e.g. 'save this as ~/notes/draft.md'). For a " +
        "small change to an existing file, prefer file_edit. The exact write is shown and fires ONLY on " +
        "confirmation; protected locations are refused.",
      domain: "files",
      groundedArgs: ["path"],
      inputSchema: {
        additionalProperties: false,
        properties: {
          content: { description: "Full file contents to write.", type: "string" },
          path: { description: "Target file path, e.g. '~/notes/draft.md'.", type: "string" }
        },
        required: ["path", "content"],
        type: "object"
      },
      keywords: ["file", "write", "create", "save", "overwrite", "파일", "저장", "생성", "만들어"],
      name: "file_write",
      risk: "write"
    },
    execute: async (args): Promise<JsonObject> => {
      const path = asString(args["path"]).trim();
      if (path.length === 0) {
        return { reason: "file_write needs `path`", written: false };
      }
      if (typeof args["content"] !== "string") {
        return { reason: "file_write needs `content` (a string)", written: false };
      }
      const content = args["content"];
      let safe: string;
      try {
        safe = await resolveSafePath(path, options, await policy);
      } catch (error) {
        return refusal(error, path);
      }
      try {
        const info = await stat(safe).catch(() => undefined);
        if (info?.isDirectory()) {
          return { path: safe, reason: `'${path}' is a directory`, written: false };
        }
        const exists = info !== undefined;
        const draft: FsWriteDraft = {
          action: "write",
          path: safe,
          preview: content.slice(0, PREVIEW_CHARS),
          summary: `${exists ? "Overwrite" : "Create"} ${safe} (${content.length.toString()} chars)`
        };
        let decision: FsWriteApprovalDecision;
        try {
          decision = await options.approvalGate(draft);
        } catch (cause) {
          return { path: safe, reason: `approval gate error: ${cause instanceof Error ? cause.message : String(cause)}`, written: false };
        }
        if (!decision.approved) {
          return { path: safe, reason: decision.reason ?? "not confirmed", written: false };
        }
        await mkdir(dirname(safe), { recursive: true });
        await writeFileNoFollow(safe, content);
        return { bytes: Buffer.byteLength(content, "utf8"), created: !exists, path: safe, written: true };
      } catch (error) {
        return refusal(error, path);
      }
    }
  };
}

function editExecutor(
  options: FsWriteToolsOptions,
  policy: Promise<ResolvedPolicy>,
  action: "edit" | "multi_edit"
) {
  return async (path: string, edits: readonly FsEditSpec[]): Promise<JsonObject> => {
    if (path.length === 0) {
      return { reason: `${action === "edit" ? "file_edit" : "file_multi_edit"} needs \`path\``, written: false };
    }
    let safe: string;
    try {
      safe = await resolveSafePath(path, options, await policy);
    } catch (error) {
      return refusal(error, path);
    }
    let original: string;
    try {
      const info = await stat(safe);
      if (info.isDirectory()) {
        return { path: safe, reason: `'${path}' is a directory`, written: false };
      }
      original = await readFileNoFollow(safe);
    } catch (error) {
      return refusal(error, path);
    }
    const outcome = applyEdits(original, edits);
    if (!outcome.ok) {
      return { path: safe, reason: outcome.reason, written: false };
    }
    if (outcome.content === original) {
      return { path: safe, reason: "edits produced no change", written: false };
    }
    const draft: FsWriteDraft = {
      action,
      path: safe,
      preview: outcome.content.slice(0, PREVIEW_CHARS),
      summary: `Apply ${edits.length.toString()} edit${edits.length === 1 ? "" : "s"} to ${safe}`
    };
    let decision: FsWriteApprovalDecision;
    try {
      decision = await options.approvalGate(draft);
    } catch (cause) {
      return { path: safe, reason: `approval gate error: ${cause instanceof Error ? cause.message : String(cause)}`, written: false };
    }
    if (!decision.approved) {
      return { path: safe, reason: decision.reason ?? "not confirmed", written: false };
    }
    try {
      await writeFileNoFollow(safe, outcome.content);
    } catch (error) {
      return refusal(error, path);
    }
    return { edits: edits.length, path: safe, written: true };
  };
}

function parseEdit(value: unknown): FsEditSpec | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record["old_string"] !== "string" || typeof record["new_string"] !== "string") {
    return undefined;
  }
  return {
    new_string: record["new_string"],
    old_string: record["old_string"],
    ...(typeof record["replace_all"] === "boolean" ? { replace_all: record["replace_all"] } : {})
  };
}

export function createFileEditTool(options: FsWriteToolsOptions, policyPromise?: Promise<ResolvedPolicy>): MuseTool {
  const policy = policyPromise ?? resolvePolicy(options);
  const run = editExecutor(options, policy, "edit");
  return {
    definition: {
      description:
        "Replace ONE exact piece of text inside an EXISTING file. old_string must match exactly and be " +
        "unique unless replace_all is set. The file must already exist (use file_write to create). For " +
        "several changes to the same file at once, use file_multi_edit. The change is shown and fires ONLY " +
        "on confirmation.",
      domain: "files",
      groundedArgs: ["path"],
      inputSchema: {
        additionalProperties: false,
        properties: {
          new_string: { description: "Replacement text.", type: "string" },
          old_string: { description: "Exact text to find (unique unless replace_all), e.g. 'const PORT = 3000'.", type: "string" },
          path: { description: "File to edit, e.g. '~/notes/todo.md'.", type: "string" },
          replace_all: { description: "Replace every occurrence (default false).", type: "boolean" }
        },
        required: ["path", "old_string", "new_string"],
        type: "object"
      },
      keywords: ["file", "edit", "replace", "change", "modify", "파일", "수정", "바꿔", "고쳐"],
      name: "file_edit",
      risk: "write"
    },
    execute: async (args): Promise<JsonObject> => {
      const spec = parseEdit(args);
      if (!spec) {
        return { reason: "file_edit needs `old_string` and `new_string` (strings)", written: false };
      }
      return run(asString(args["path"]).trim(), [spec]);
    }
  };
}

export function createFileMultiEditTool(options: FsWriteToolsOptions, policyPromise?: Promise<ResolvedPolicy>): MuseTool {
  const policy = policyPromise ?? resolvePolicy(options);
  const run = editExecutor(options, policy, "multi_edit");
  return {
    definition: {
      description:
        "Apply SEVERAL exact-text replacements to ONE existing file, in order. Use only when you have 2+ " +
        "edits to the same file; for a single change use file_edit. Each edit's old_string must match " +
        "exactly. All edits are validated first — if any fails, NOTHING is written. Shown and fires ONLY on " +
        "confirmation.",
      domain: "files",
      groundedArgs: ["path"],
      inputSchema: {
        additionalProperties: false,
        properties: {
          edits: {
            description: "Edits applied in order.",
            items: {
              additionalProperties: false,
              properties: {
                new_string: { description: "Replacement text.", type: "string" },
                old_string: { description: "Exact text to find.", type: "string" },
                replace_all: { description: "Replace every occurrence (default false).", type: "boolean" }
              },
              required: ["old_string", "new_string"],
              type: "object"
            },
            minItems: 1,
            type: "array"
          },
          path: { description: "File to edit, e.g: '~/notes/todo.md'.", type: "string" }
        },
        required: ["path", "edits"],
        type: "object"
      },
      keywords: ["file", "edit", "edits", "replace", "multiple", "파일", "수정", "여러", "일괄"],
      name: "file_multi_edit",
      risk: "write"
    },
    execute: async (args): Promise<JsonObject> => {
      const rawEdits = args["edits"];
      if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
        return { reason: "file_multi_edit needs a non-empty `edits` array", written: false };
      }
      const specs: FsEditSpec[] = [];
      for (const raw of rawEdits) {
        const spec = parseEdit(raw);
        if (!spec) {
          return { reason: "each edit needs `old_string` and `new_string` (strings)", written: false };
        }
        specs.push(spec);
      }
      return run(asString(args["path"]).trim(), specs);
    }
  };
}

export function createFsWriteTools(options: FsWriteToolsOptions): readonly MuseTool[] {
  const policy = resolvePolicy(options);
  return [
    createFileWriteTool(options, policy),
    createFileEditTool(options, policy),
    createFileMultiEditTool(options, policy)
  ];
}
