/**
 * `file_read` — read a document from the user's everyday folders by NAME.
 *
 * Same grounding philosophy as the browser matcher: the small model names
 * what it wants ("invoice pdf", "report.md") and deterministic code resolves
 * it — newest match wins, an unmatched name returns the recent files instead
 * of a guess, a path outside the allowed roots is refused (fail-closed,
 * the muse.fs allowlist posture). PDF text comes from a lazily-imported
 * pdfjs-dist (Apache-2.0, Mozilla) with script eval disabled.
 */

import { readdir as nodeReaddir, readFile as nodeReadFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve as pathResolve, sep as pathSep } from "node:path";

import type { JsonObject, JsonValue } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

export interface FileCandidate {
  readonly path: string;
  readonly name: string;
  readonly modifiedMs: number;
}

export type FileKind = "pdf" | "text" | "unsupported";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "log", "yaml", "yml", "toml", "ini",
  "ts", "tsx", "js", "mjs", "cjs", "py", "rb", "go", "rs", "java", "swift", "sh", "html", "css", "xml"
]);

export function classifyFileKind(name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  return "unsupported";
}

/**
 * Score a candidate against the model's free-text file reference:
 * exact filename > prefix > containment > word overlap; ties resolved by
 * recency (newest first). Zero-score candidates are dropped entirely.
 */
export function rankFileCandidates(candidates: readonly FileCandidate[], query: string): readonly FileCandidate[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const needleWords = needle.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  const scored = candidates
    .map((candidate) => {
      const name = candidate.name.toLowerCase();
      let score = 0;
      if (name === needle) score = 100;
      else if (name.startsWith(needle)) score = 80;
      else if (name.includes(needle)) score = 60;
      else {
        const hits = needleWords.filter((word) => name.includes(word)).length;
        score = hits === needleWords.length && hits > 0 ? 40 : hits > 0 ? 10 + hits : 0;
      }
      return { candidate, score };
    })
    .filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || b.candidate.modifiedMs - a.candidate.modifiedMs);
  return scored.map((entry) => entry.candidate);
}

export interface FileReadFsImpl {
  /** All readable files under the roots (depth-bounded walk). */
  listCandidates(roots: readonly string[]): Promise<readonly FileCandidate[]>;
  readFile(path: string): Promise<Buffer>;
}

export interface FileReadToolDeps {
  /** Folders the tool may read. Default: ~/Downloads, ~/Desktop, ~/Documents. */
  readonly roots?: readonly string[];
  readonly fsImpl?: FileReadFsImpl;
  /** PDF text extractor; defaults to the lazy pdfjs-dist implementation. */
  readonly extractPdfText?: (data: Buffer) => Promise<string>;
  /** Cap on returned characters. Default 20,000. */
  readonly maxTextChars?: number;
  /** Files larger than this are refused. Default 25MB. */
  readonly maxFileBytes?: number;
}

const WALK_DEPTH = 3;
const RECENT_LIST = 10;

async function walkCandidates(roots: readonly string[]): Promise<readonly FileCandidate[]> {
  const out: FileCandidate[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > WALK_DEPTH) return;
    let entries;
    try {
      entries = await nodeReaddir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          const { mtimeMs } = await import("node:fs/promises").then((fs) => fs.stat(full));
          out.push({ modifiedMs: mtimeMs, name: entry.name, path: full });
        } catch { /* unreadable entry — skip */ }
      }
    }
  };
  for (const root of roots) {
    await walk(root, 0);
  }
  return out;
}

export async function extractPdfTextWithPdfjs(data: Buffer, maxPages = 50): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const doc = await loadingTask.promise;
    const pages = Math.min(doc.numPages, maxPages);
    const parts: string[] = [];
    for (let pageNo = 1; pageNo <= pages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      parts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return parts.join("\n").replace(/[ \t]+/g, " ").trim();
  } finally {
    await loadingTask.destroy();
  }
}

export function createFileReadTool(deps: FileReadToolDeps = {}): MuseTool {
  const roots = (deps.roots ?? [join(homedir(), "Downloads"), join(homedir(), "Desktop"), join(homedir(), "Documents")])
    .map((root) => pathResolve(root));
  const fsImpl: FileReadFsImpl = deps.fsImpl ?? { listCandidates: walkCandidates, readFile: (path) => nodeReadFile(path) };
  const extractPdf = deps.extractPdfText ?? extractPdfTextWithPdfjs;
  const maxTextChars = deps.maxTextChars ?? 20_000;
  const maxFileBytes = deps.maxFileBytes ?? 25 * 1024 * 1024;
  return {
    definition: {
      description:
        "Read a document FILE from the user's Downloads, Desktop, or Documents folder and return its text " +
        "— PDFs included (text is extracted locally). Say WHICH file in `file` — a filename or part of one " +
        "('invoice pdf', 'report.md') — and Muse finds the newest match. Use when the user asks to read / " +
        "open / summarize a file on their computer — e.g. '다운로드에 있는 invoice.pdf 요약해줘', 'read the " +
        "report on my Desktop'. NOT for the user's Muse notes (muse.notes.search) and NOT for just locating " +
        "a file's path (mac_spotlight_search).",
      domain: "files",
      groundedArgs: ["file"],
      inputSchema: {
        additionalProperties: false,
        properties: {
          file: {
            description: "The file to read — a filename or fragment, e.g. 'invoice.pdf' or '5월 영수증', or an absolute path.",
            type: "string"
          }
        },
        required: ["file"],
        type: "object"
      },
      keywords: ["file", "파일", "pdf", "문서", "document", "읽어", "downloads", "다운로드", "desktop", "바탕화면", "documents", "summarize", "요약"],
      name: "file_read",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const query = typeof args["file"] === "string" ? args["file"].trim() : "";
      if (query.length === 0) {
        return { read: false, reason: "file_read needs `file` — the filename (or part of it) to read" };
      }
      try {
        let target: FileCandidate | undefined;
        if (query.startsWith("/") || query.startsWith("~")) {
          const resolved = pathResolve(query.replace(/^~(?=\/|$)/, homedir()));
          if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}${pathSep}`))) {
            return { read: false, reason: `'${query}' is outside the readable folders (${roots.join(", ")})` };
          }
          target = { modifiedMs: 0, name: resolved.split(pathSep).pop() ?? resolved, path: resolved };
        } else {
          const candidates = await fsImpl.listCandidates(roots);
          const ranked = rankFileCandidates(candidates, query);
          target = ranked[0];
          if (!target) {
            const recent = [...candidates].sort((a, b) => b.modifiedMs - a.modifiedMs).slice(0, RECENT_LIST).map((c) => c.name);
            return { read: false, reason: `no file matching "${query}" — recent files listed`, recent: recent as unknown as JsonValue };
          }
        }
        const kind = classifyFileKind(target.name);
        if (kind === "unsupported") {
          return { read: false, reason: `'${target.name}' is not a readable document (PDF or text files only)` };
        }
        const data = await fsImpl.readFile(target.path);
        if (data.byteLength > maxFileBytes) {
          return { read: false, reason: `'${target.name}' is too large (${Math.round(data.byteLength / 1024 / 1024).toString()}MB > 25MB)` };
        }
        const text = kind === "pdf" ? await extractPdf(data) : data.toString("utf8");
        const truncated = text.length > maxTextChars;
        return {
          name: target.name,
          path: target.path,
          read: true,
          text: truncated ? text.slice(0, maxTextChars) : text,
          truncated
        };
      } catch (cause) {
        return { read: false, reason: cause instanceof Error ? cause.message : String(cause) };
      }
    }
  };
}
