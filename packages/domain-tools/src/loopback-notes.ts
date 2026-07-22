import { Buffer } from "node:buffer";
import {
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  stat as nodeStat,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile
} from "node:fs/promises";
import { resolve as nodePathResolve } from "node:path";

import { assertNoSecretInPersistedFields, type JsonObject, type JsonValue } from "@muse/shared";
import { atomicWriteFile, withFileLock, withFileMutationQueue } from "@muse/stores";

import { readString } from "@muse/mcp";
import type { LoopbackMcpServer } from "@muse/mcp";
import {
  createNotesPathResolver,
  deriveMirrorNoteTitle,
  type NoteMirror,
  walkMarkdownFrom
} from "./loopback-notes-helpers.js";
import { runNotesLlmJudge } from "./loopback-notes-judge.js";
import { sliceWithoutLoneSurrogate } from "./notes-providers-local.js";
import type { ProactiveModelProviderLike } from "@muse/proactivity";
import { errorMessage } from "@muse/shared";

/**
 * `muse.notes` loopback MCP server.
 *
 * Lifted out of `loopback.ts` (which had grown past 2,300 LOC) to
 * keep the notes-specific path-resolution and markdown-walk helpers
 * close to the tool definitions that use them. Same public surface
 * as before: `NotesMcpServerOptions` + `createNotesMcpServer`. Both
 * symbols are re-exported from `loopback.ts` so consumers
 * (`packages/mcp/src/index.ts`, the autoconfigure entry point, and
 * the existing tests) keep working without import-site edits.
 *
 * The non-tool-definition helpers (path validation, markdown walk, mirror
 * title, LLM-judge search) live in `loopback-notes-helpers.ts` and
 * `loopback-notes-judge.ts`; `NoteMirror` + `deriveMirrorNoteTitle` are
 * re-exported below so this module's own public surface is unchanged.
 */

export type { NoteMirror };
export { deriveMirrorNoteTitle };

/** Default entries returned by `list` when `limit` is omitted. */
const DEFAULT_LIST_LIMIT = 25;
/** Default chars returned by `read` when `maxChars` is omitted — bounds a single read so a large note can't flood a small model's turn. */
const DEFAULT_READ_MAX_CHARS = 8_000;
/** Cap on matches counted per note in `search` (substring mode) so `limit` spreads across distinct notes instead of being consumed by the first match-heavy file. */
const SEARCH_PER_FILE_MATCH_CAP = 2;

function describeArgType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

/**
 * Distinguishes "key absent" from "key present but the wrong type" — the two
 * read as the same failure to a small model unless the message says which one
 * happened. `formDescription`/`example` name the expected shape so the model
 * can repair its own call in one step.
 */
function requireStringArg(
  args: JsonObject,
  key: string,
  formDescription: string,
  example: string
): { readonly value: string } | { readonly error: string } {
  const raw = args[key];
  if (raw === undefined) {
    return { error: `${key} is required` };
  }
  if (typeof raw !== "string") {
    return { error: `${key} must be ${formDescription}, e.g. '${example}' (got ${describeArgType(raw)})` };
  }
  return { value: raw };
}

/** Maps a Node ENOENT/EACCES-class error to a short stable code — never the raw errno message, which carries the absolute host path. */
function ioErrorCode(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

export interface NotesMcpServerOptions {
  readonly notesDir: string;
  readonly defaultSearchLimit?: number;
  readonly maxSearchLimit?: number;
  readonly maxQueryLength?: number;
  readonly maxFileBytes?: number;
  readonly maxListEntries?: number;
  /**
   * Optional model provider for the `search` tool's `mode: "llm-judge"`
   * path. When set with `model`, the search tool gains a paraphrase-
   * recall mode that asks the LLM to pick relevant note paths from
   * a list of (path, first-paragraph-preview) pairs. No vector index
   * needed — at personal scale (≤ a few hundred notes) one extra
   * round-trip is cheaper than running pgvector + embeddings.
   *
   * Two-step retrieval pattern: this tool returns paths; the LLM
   * then `muse.notes.read`s each chosen path for the full content.
   */
  readonly modelProvider?: ProactiveModelProviderLike;
  readonly model?: string;
  /** Cap on preview chars per note in the LLM-judge prompt. Default 200. */
  readonly judgePreviewChars?: number;
  /** Cap on notes considered in a single LLM-judge call. Default 200. */
  readonly judgeMaxCandidates?: number;
  /**
   * Existence probe for the `save` tool's pre-write check. Defaults to a
   * `stat`-based check. Injectable so a test can simulate the TOCTOU window
   * (probe says absent, then a concurrent create lands before the write) and
   * assert the atomic `wx` write refuses to clobber it.
   */
  readonly probeExists?: (absolutePath: string) => Promise<boolean>;
  /**
   * When set, a `save` that CREATES a new note (not an overwrite of an existing
   * one) also mirrors it into Apple Notes (injected — see {@link NoteMirror}).
   * Omitted ⇒ no mirror, behaviour unchanged. Create-only: append / delete /
   * overwrite-in-place never fire it.
   */
  readonly mirror?: NoteMirror;
}

export function createNotesMcpServer(options: NotesMcpServerOptions): LoopbackMcpServer {
  if (!options.notesDir || options.notesDir.trim().length === 0) {
    throw new Error("createNotesMcpServer requires a notesDir");
  }
  const root = nodePathResolve(options.notesDir);
  const defaultSearchLimit = normalizeLimit(options.defaultSearchLimit, 20, 1);
  const maxSearchLimit = Math.max(defaultSearchLimit, normalizeLimit(options.maxSearchLimit, 100, 1));
  const maxQueryLength = normalizeLimit(options.maxQueryLength, 500, 16);
  const maxFileBytes = normalizeLimit(options.maxFileBytes, 1_048_576, 1_024);
  const maxListEntries = normalizeLimit(options.maxListEntries, 500, 1);
  const probeExists =
    options.probeExists ??
    (async (absolutePath: string): Promise<boolean> => {
      try {
        await nodeStat(absolutePath);
        return true;
      } catch {
        return false;
      }
    });

  const resolveSafe = createNotesPathResolver(root);

  async function mutateNote<T>(file: string, operation: () => Promise<T>): Promise<T> {
    return withFileMutationQueue(file, () => withFileLock(file, operation));
  }

  // Thin wrapper over the module-level walker that closes over the
  // server's `root` so callers don't need to keep passing it.
  async function walkMarkdown(dir: string, accept: (relPath: string) => void, visited: Set<string>): Promise<void> {
    await walkMarkdownFrom(root, dir, accept, visited);
  }

  return {
    description: "Personal markdown notes inside a sandboxed directory (loopback MCP).",
    name: "muse.notes",
    tools: [
      {
        description:
          `List entries inside the notes directory (or \`subdir\` relative to it). Returns up to \`limit\` items ` +
          `(default ${DEFAULT_LIST_LIMIT.toString()}, max ${maxListEntries.toString()}) with \`name\` and \`isDirectory\`; \`total\` and ` +
          "`truncated` say how many more exist. Pass `sort: 'recent'` to order newest-modified first — answers " +
          "'what did I note recently / my latest notes' — which also adds `sizeBytes` (files) and `modifiedAtIso` per entry. " +
          "Hidden entries (dotfiles) are skipped. Non-recursive — pass deeper subdirs explicitly.",
        execute: async (args): Promise<JsonObject> => {
          const subdirInput = readString(args, "subdir");
          const target = subdirInput && subdirInput.trim().length > 0 ? subdirInput : "";
          const safe = target.length === 0 ? { absolute: root, relative: "" } : await resolveSafe(target);
          if (typeof safe === "string") {
            return { error: safe };
          }

          const sortRaw = args["sort"];
          let wantsRecent = false;
          let sortNote: string | undefined;
          if (sortRaw !== undefined) {
            if (sortRaw === "recent") {
              wantsRecent = true;
            } else if (typeof sortRaw === "string") {
              sortNote = `'${sortRaw}' is not a valid sort — the only supported value is 'recent'. Listed in directory order instead.`;
            } else {
              sortNote = `sort must be a string ('recent'), got ${describeArgType(sortRaw)}. Listed in directory order instead.`;
            }
          }

          const limitArg = args["limit"];
          let requestedLimit = DEFAULT_LIST_LIMIT;
          let limitNote: string | undefined;
          if (limitArg !== undefined) {
            if (typeof limitArg === "number" && Number.isFinite(limitArg) && limitArg >= 1) {
              requestedLimit = Math.trunc(limitArg);
            } else {
              limitNote = `limit must be a positive number (max ${maxListEntries.toString()}) — using the default ${DEFAULT_LIST_LIMIT.toString()} instead.`;
            }
          }
          const appliedLimit = Math.min(requestedLimit, maxListEntries);

          let dirents: Array<{ name: string; isDirectory(): boolean }>;
          try {
            dirents = await nodeReaddir(safe.absolute, { withFileTypes: true });
          } catch (error) {
            if (ioErrorCode(error) === "ENOENT") {
              return { error: `no such note directory '${safe.relative}' — call muse.notes.list with no subdir to see what exists` };
            }
            const code = ioErrorCode(error);
            return { error: `cannot list directory '${safe.relative}'${code ? ` (${code})` : ""}` };
          }
          const collected: Array<{ row: JsonObject; mtimeMs: number }> = [];
          for (const entry of dirents) {
            if (entry.name.startsWith(".")) {
              continue;
            }
            const isDirectory = entry.isDirectory();
            let sizeBytes: number | undefined;
            let modifiedAtIso: string | undefined;
            let mtimeMs = 0;
            if (wantsRecent) {
              const childAbs = nodePathResolve(safe.absolute, entry.name);
              try {
                const stat = await nodeStat(childAbs);
                mtimeMs = stat.mtimeMs;
                modifiedAtIso = new Date(stat.mtimeMs).toISOString();
                if (!isDirectory) {
                  sizeBytes = stat.size;
                }
              } catch {
                modifiedAtIso = undefined;
              }
            }
            collected.push({
              mtimeMs,
              row: {
                isDirectory,
                name: entry.name,
                ...(sizeBytes !== undefined ? { sizeBytes } : {}),
                ...(modifiedAtIso ? { modifiedAtIso } : {})
              }
            });
          }
          if (wantsRecent) {
            collected.sort((a, b) => b.mtimeMs - a.mtimeMs);
          }
          const total = collected.length;
          const truncated = total > appliedLimit;
          const note = [sortNote, limitNote].filter((entry): entry is string => Boolean(entry)).join(" ");
          return {
            dir: safe.relative,
            entries: collected.slice(0, appliedLimit).map((item) => item.row) as JsonValue,
            sort: wantsRecent ? "recent" : "directory",
            total,
            truncated,
            ...(note ? { note } : {})
          } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            limit: {
              description: `Max entries to return. Defaults to ${DEFAULT_LIST_LIMIT.toString()}; capped at ${maxListEntries.toString()}.`,
              minimum: 1,
              type: "number"
            },
            sort: { description: "Order: omit for directory order, or 'recent' for newest-modified first (answers 'my recent notes').", enum: ["recent"], type: "string" },
            subdir: { description: "Subdirectory relative to the notes root. Defaults to the root.", type: "string" }
          },
          type: "object"
        },
        domain: "notes",
        name: "list",
        keywords: ["notes", "노트", "메모", "list", "목록"],
        risk: "read"
      },
      {
        description:
          `Read a markdown / text note as UTF-8. Returns at most \`maxChars\` characters (default ${DEFAULT_READ_MAX_CHARS.toString()}) ` +
          "starting at `offset` (default 0, 0-based); a truncated result carries `nextOffset` — pass it back as `offset` " +
          "to read the next slice of a long note. Bounded at `maxFileBytes` overall; returns an error for binary files.",
        execute: async (args): Promise<JsonObject> => {
          const pathResult = requireStringArg(args, "path", "a string relative to the notes directory", "daily/2026-07-21.md");
          if ("error" in pathResult) {
            return { error: pathResult.error };
          }
          const path = pathResult.value;
          const safe = await resolveSafe(path);
          if (typeof safe === "string") {
            return { error: safe };
          }

          // A numeric STRING is repaired, not refused, matching every sibling
          // that takes a numeric argument (time_add, muse.tasks.list,
          // browser_read): the small local model routinely quotes numbers, and
          // refusing a value we can read costs a round trip it cannot spare.
          const readNumericArg = (raw: unknown): unknown =>
            typeof raw === "string" && /^\d+$/u.test(raw.trim()) ? Number(raw.trim()) : raw;

          const offsetArg = readNumericArg(args["offset"]);
          let offset = 0;
          if (offsetArg !== undefined) {
            if (typeof offsetArg === "number" && Number.isFinite(offsetArg) && offsetArg >= 0) {
              offset = Math.trunc(offsetArg);
            } else {
              return { error: `offset must be a non-negative number, e.g. 0 (got ${describeArgType(offsetArg)})` };
            }
          }
          const maxCharsArg = readNumericArg(args["maxChars"]);
          let maxChars = DEFAULT_READ_MAX_CHARS;
          if (maxCharsArg !== undefined) {
            if (typeof maxCharsArg === "number" && Number.isFinite(maxCharsArg) && maxCharsArg >= 1) {
              maxChars = Math.trunc(maxCharsArg);
            } else {
              return { error: `maxChars must be a positive number, e.g. ${DEFAULT_READ_MAX_CHARS.toString()} (got ${describeArgType(maxCharsArg)})` };
            }
          }
          // A caller that explicitly windows the read (offset/maxChars) is asking
          // for a bounded slice regardless of the file's total size, so it may
          // still page through a note over maxFileBytes one piece at a time.
          const explicitWindow = offsetArg !== undefined || maxCharsArg !== undefined;

          let stat: Awaited<ReturnType<typeof nodeStat>>;
          try {
            stat = await nodeStat(safe.absolute);
          } catch (error) {
            if (ioErrorCode(error) === "ENOENT") {
              return { error: `no such note '${safe.relative}' — use muse.notes.search or muse.notes.list to find the right path` };
            }
            const code = ioErrorCode(error);
            return { error: `cannot read note '${safe.relative}'${code ? ` (${code})` : ""}` };
          }
          if (stat.isDirectory()) {
            return { error: "path is a directory, not a file" };
          }
          if (stat.size > maxFileBytes && !explicitWindow) {
            return {
              error: `file is ${stat.size.toString()} bytes, exceeds maxFileBytes ${maxFileBytes.toString()} — read it in pieces, ` +
                `e.g. {"path":"${safe.relative}","offset":0,"maxChars":${DEFAULT_READ_MAX_CHARS.toString()}}`
            };
          }
          let fullContent: string;
          try {
            fullContent = await nodeReadFile(safe.absolute, "utf8");
          } catch (error) {
            const code = ioErrorCode(error);
            return { error: `cannot read note '${safe.relative}'${code ? ` (${code})` : ""}` };
          }
          const totalChars = fullContent.length;
          const start = Math.min(offset, totalChars);
          const window = sliceWithoutLoneSurrogate(fullContent.slice(start), maxChars);
          const truncated = start + window.length < totalChars;
          return {
            content: window,
            offset: start,
            path: safe.relative,
            returnedChars: window.length,
            sizeBytes: stat.size,
            truncated,
            ...(truncated ? { nextOffset: start + window.length } : {})
          } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            maxChars: {
              description: `Max characters to return. Defaults to ${DEFAULT_READ_MAX_CHARS.toString()}; a truncated result carries \`nextOffset\`.`,
              minimum: 1,
              type: "number"
            },
            offset: { description: "0-based character offset to resume from (page through a long note via the previous result's `nextOffset`). Defaults to 0.", minimum: 0, type: "number" },
            path: { description: "Note path relative to the notes directory (e.g. `daily/2026-05-09.md`).", type: "string" }
          },
          required: ["path"],
          type: "object"
        },
        domain: "notes",
        name: "read",
        keywords: ["notes", "노트", "메모", "read", "읽어"],
        risk: "read"
      },
      {
        description:
          "Search notes. `mode: 'substring'` (default) does case-insensitive grep across markdown files and " +
          `returns up to \`limit\` matches (default ${defaultSearchLimit}, max ${maxSearchLimit}) with path + line + snippet. ` +
          "`mode: 'llm-judge'` asks the model to pick the most relevant note paths from a list of (path, first-paragraph-preview) pairs — " +
          "useful for paraphrase queries (\"the Notion thing\" → matches a note tagged Notion); follow up with " +
          "`muse.notes.read` on each returned path. llm-judge mode requires modelProvider + model wired into createNotesMcpServer.",
        execute: async (args): Promise<JsonObject> => {
          const queryRaw = args["query"];
          if (queryRaw !== undefined && typeof queryRaw !== "string") {
            return { error: `query must be a string, e.g. 'budget' (got ${describeArgType(queryRaw)})` };
          }
          const query = (typeof queryRaw === "string" ? queryRaw : "").trim();
          if (!query) {
            return { error: "query is required" };
          }
          if (query.length > maxQueryLength) {
            return { error: `query must be at most ${maxQueryLength} characters` };
          }
          const limitArg = args["limit"];
          const limit = typeof limitArg === "number" && Number.isFinite(limitArg)
            ? Math.max(1, Math.min(maxSearchLimit, Math.trunc(limitArg)))
            : defaultSearchLimit;
          const mode = readString(args, "mode") === "llm-judge" ? "llm-judge" : "substring";

          if (mode === "llm-judge") {
            if (!options.modelProvider || !options.model) {
              return { error: "llm-judge mode requires modelProvider + model wired into createNotesMcpServer; re-run with mode: 'substring' or configure the provider" };
            }
            try {
              const judged = await runNotesLlmJudge({
                judgeMaxCandidates: normalizeLimit(options.judgeMaxCandidates, 200, 1),
                judgePreviewChars: normalizeLimit(options.judgePreviewChars, 200, 50),
                limit,
                maxFileBytes,
                model: options.model,
                modelProvider: options.modelProvider,
                query,
                root
              });
              if (!judged.judgeParsed) {
                return { error: `llm-judge could not select over ${judged.candidatesConsidered.toString()} candidate notes — re-run with mode: 'substring'` };
              }
              return {
                candidatesConsidered: judged.candidatesConsidered,
                judgeParsed: true,
                matches: judged.paths.map((p) => ({ path: p })) as JsonValue,
                mode: "llm-judge",
                query,
                // Count only — non-zero means the model fabricated
                // paths. The path strings are untrusted; never echo.
                ...(judged.hallucinatedDropped > 0 ? { hallucinatedDropped: judged.hallucinatedDropped } : {})
              } satisfies JsonObject;
            } catch (cause) {
              return { error: `llm-judge failed: ${errorMessage(cause)}` };
            }
          }

          const needle = query.toLowerCase();
          const files: string[] = [];
          await walkMarkdown(root, (rel) => { files.push(rel); }, new Set());
          const matches: JsonObject[] = [];
          let totalMatches = 0;
          const filesMatched = new Set<string>();
          for (const rel of files) {
            const abs = nodePathResolve(root, rel);
            let stat: Awaited<ReturnType<typeof nodeStat>>;
            try {
              stat = await nodeStat(abs);
            } catch {
              continue;
            }
            if (stat.size > maxFileBytes) {
              continue;
            }
            let body: string;
            try {
              body = await nodeReadFile(abs, "utf8");
            } catch {
              continue;
            }
            const lines = body.split(/\r?\n/u);
            let matchesInFile = 0;
            for (let index = 0; index < lines.length; index += 1) {
              const line = lines[index] ?? "";
              if (line.toLowerCase().includes(needle)) {
                totalMatches += 1;
                filesMatched.add(rel);
                // Cap per-file so `limit` spreads across distinct notes instead
                // of being exhausted by the first alphabetically-early match.
                if (matches.length < limit && matchesInFile < SEARCH_PER_FILE_MATCH_CAP) {
                  matches.push({
                    line: index + 1,
                    path: rel,
                    snippet: line.length > 240 ? `${sliceWithoutLoneSurrogate(line, 240)}...` : line
                  });
                  matchesInFile += 1;
                }
              }
            }
          }
          return {
            filesMatched: filesMatched.size,
            matches: matches as JsonValue,
            mode: "substring",
            query,
            totalMatches,
            truncated: totalMatches > matches.length
          } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            limit: {
              description: `Max matches (substring) or paths (llm-judge) to return. Defaults to ${defaultSearchLimit}; capped at ${maxSearchLimit}.`,
              type: "number"
            },
            mode: {
              description: "'substring' (default) for case-insensitive grep; 'llm-judge' for paraphrase-aware path selection by the model.",
              enum: ["substring", "llm-judge"],
              type: "string"
            },
            query: { description: "Substring (substring mode) or natural-language query (llm-judge mode).", type: "string" }
          },
          required: ["query"],
          type: "object"
        },
        domain: "notes",
        name: "search",
        keywords: ["notes", "노트", "메모", "search", "찾아", "검색"],
        risk: "read"
      },
      {
        description:
          "Write a markdown note to `path` relative to the notes directory. " +
          "Creates parent directories as needed. With `overwrite: false` (default), errors if the file exists; " +
          "with `overwrite: true`, replaces the file in place. Returns `{ path, sizeBytes, created }`. " +
          "Use when CREATING a new note or REPLACING a note's whole contents at a path ('save a note', '노트 새로 만들어 적어줘'). " +
          "NOT when adding a line to an EXISTING note (use muse.notes.append), nor for a to-do (use muse.tasks.add) " +
          "or a timed reminder (use muse.reminders.add) — a note is a markdown FILE, not a scheduled item.",
        execute: async (args): Promise<JsonObject> => {
          const path = readString(args, "path");
          const content = readString(args, "content");
          if (path === undefined) {
            return { error: "path is required" };
          }
          if (content === undefined) {
            return { error: "content is required" };
          }
          const guard = assertNoSecretInPersistedFields({ content });
          if (!guard.safe) {
            return { blocked: true, error: guard.notice, kinds: guard.kinds as JsonValue };
          }
          if (Buffer.byteLength(content, "utf8") > maxFileBytes) {
            return { error: `content exceeds maxFileBytes ${maxFileBytes}` };
          }
          const overwrite = args["overwrite"] === true;
          const safe = await resolveSafe(path);
          if (typeof safe === "string") {
            return { error: safe };
          }
          let created: boolean;
          try {
            created = await mutateNote(safe.absolute, async () => {
              const exists = await probeExists(safe.absolute);
              if (exists && !overwrite) {
                throw new Error("NOTE_ALREADY_EXISTS");
              }
              if (overwrite) {
                await atomicWriteFile(safe.absolute, content);
              } else {
                // Keep exclusive creation under the lock: another writer that
                // does not participate in Muse's lock still cannot clobber us.
                await nodeWriteFile(safe.absolute, content, { encoding: "utf8", flag: "wx" });
              }
              return !exists;
            });
          } catch (error) {
            if (!overwrite && ((error as NodeJS.ErrnoException).code === "EEXIST" || (error as Error).message === "NOTE_ALREADY_EXISTS")) {
              return { error: `note already exists at ${safe.relative}; pass overwrite: true to replace` };
            }
            return { error: `cannot write note: ${errorMessage(error)}` };
          }
          // Best-effort Apple-Notes mirror. Create-only: fires ONLY when this
          // write brought a NEW note file into being (`!exists`), never on an
          // overwrite-in-place (that is an edit, and the mirror is one-way). It
          // runs strictly after the note is persisted and can NEVER fail the
          // Muse write — a failure surfaces as a visible `mirrorNote`, nothing
          // more. The Muse-side file is already written and is left untouched.
          let mirrorNote: string | undefined;
          if (options.mirror && created) {
            try {
              const outcome = await options.mirror({ body: content, title: deriveMirrorNoteTitle(safe.relative, content) });
              if (outcome.warning) {
                mirrorNote = outcome.warning;
              }
            } catch (error) {
              mirrorNote = `Apple Notes mirror failed: ${errorMessage(error)}`;
            }
          }
          return {
            created,
            path: safe.relative,
            sizeBytes: Buffer.byteLength(content, "utf8"),
            ...(mirrorNote ? { mirrorNote } : {})
          } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            content: { description: "UTF-8 file contents.", type: "string" },
            overwrite: { description: "If true, replace an existing file. Defaults to false.", type: "boolean" },
            path: { description: "Note path relative to the notes directory.", type: "string" }
          },
          required: ["content", "path"],
          type: "object"
        },
        domain: "notes",
        name: "save",
        keywords: ["notes", "노트", "메모", "save", "저장", "적어"],
        risk: "write"
      },
      {
        description:
          "Append `content` to the END of a note at `path`. Creates the file (and parent directories) if missing. " +
          "Useful for daily journals, running task lists, append-only logs. " +
          "Use when ADDING to an EXISTING note ('append to my journal', '일지에 한 줄 덧붙여줘'). " +
          "NOT when creating or replacing a whole note (use muse.notes.save), nor for a to-do " +
          "(use muse.tasks.add) or a timed reminder (use muse.reminders.add).",
        execute: async (args): Promise<JsonObject> => {
          const path = readString(args, "path");
          const content = readString(args, "content");
          if (path === undefined) {
            return { error: "path is required" };
          }
          if (content === undefined) {
            return { error: "content is required" };
          }
          const guard = assertNoSecretInPersistedFields({ content });
          if (!guard.safe) {
            return { blocked: true, error: guard.notice, kinds: guard.kinds as JsonValue };
          }
          const safe = await resolveSafe(path);
          if (typeof safe === "string") {
            return { error: safe };
          }
          try {
            const result = await mutateNote(safe.absolute, async () => {
              let existing = "";
              try {
                existing = await nodeReadFile(safe.absolute, "utf8");
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                  throw error;
                }
              }
              const next = existing + content;
              const sizeBytes = Buffer.byteLength(next, "utf8");
              if (sizeBytes > maxFileBytes) {
                return { currentBytes: Buffer.byteLength(existing, "utf8") };
              }
              await atomicWriteFile(safe.absolute, next);
              return { sizeBytes };
            });
            if ("currentBytes" in result) {
              return { error: `note would exceed maxFileBytes ${maxFileBytes} (current=${result.currentBytes}, append=${Buffer.byteLength(content, "utf8")})`, path: safe.relative };
            }
            return { path: safe.relative, sizeBytes: result.sizeBytes } satisfies JsonObject;
          } catch (error) {
            return { error: `cannot append to note: ${errorMessage(error)}` };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            content: { description: "UTF-8 text to append.", type: "string" },
            path: { description: "Note path relative to the notes directory.", type: "string" }
          },
          required: ["content", "path"],
          type: "object"
        },
        domain: "notes",
        name: "append",
        keywords: ["notes", "노트", "메모", "append", "추가", "적어"],
        risk: "write"
      },
      {
        description:
          "Delete a note at `path`. Use to remove an outdated / wrong / no-longer-needed note so it stops surfacing in search and knowledge. Returns deleted:false when no note matches the path (not an error). Removes one file — not a directory.",
        execute: async (args): Promise<JsonObject> => {
          const path = readString(args, "path");
          if (path === undefined) {
            return { error: "path is required" };
          }
          const safe = await resolveSafe(path);
          if (typeof safe === "string") {
            return { error: safe };
          }
          let stat: Awaited<ReturnType<typeof nodeStat>>;
          try {
            stat = await nodeStat(safe.absolute);
          } catch {
            return { deleted: false, path: safe.relative };
          }
          if (stat.isDirectory()) {
            return { error: "path is a directory, not a note file" };
          }
          try {
            await nodeUnlink(safe.absolute);
          } catch (error) {
            return { error: `cannot delete note: ${errorMessage(error)}` };
          }
          return { deleted: true, path: safe.relative } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            path: { description: "Note path relative to the notes directory, e.g. 'meeting-notes.md'.", type: "string" }
          },
          required: ["path"],
          type: "object"
        },
        domain: "notes",
        name: "delete",
        keywords: ["notes", "노트", "메모", "delete", "삭제", "지워"],
        risk: "write"
      }
    ]
  };
}

function normalizeLimit(value: number | undefined, fallback: number, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.trunc(value));
}
