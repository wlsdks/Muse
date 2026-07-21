/**
 * Document-format helpers for `file_read` — kind classification (by
 * extension AND by content sniff), image MIME detection, fuzzy filename
 * ranking, the bounded everyday-folder walk, and the lazy PDF/DOCX text
 * extractors. Migrated from `@muse/mcp` so `@muse/fs` owns the whole
 * Claude-Code-grade read surface (path + line ranges + rich documents) in
 * one place; `@muse/mcp`'s web_read imports the PDF extractor back from here.
 *
 * PDF text comes from a lazily-imported pdfjs-dist (Apache-2.0, Mozilla)
 * with script eval disabled; DOCX from a lazily-imported mammoth.
 */

import { readdir as nodeReaddir, stat as nodeStat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface FileCandidate {
  readonly path: string;
  readonly name: string;
  readonly modifiedMs: number;
}

export type FileKind = "pdf" | "docx" | "pptx" | "eml" | "image" | "text" | "unsupported";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "json", "csv", "tsv", "log", "yaml", "yml", "toml", "ini",
  "ts", "tsx", "js", "mjs", "cjs", "py", "rb", "go", "rs", "java", "swift", "sh", "html", "css", "xml"
]);

const IMAGE_EXTENSIONS = new Map<string, string>([
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"],
  ["gif", "image/gif"], ["webp", "image/webp"], ["bmp", "image/bmp"]
]);

export function classifyFileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? (lower.split(".").pop() ?? "") : "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "eml") return "eml";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  return "unsupported";
}

/** MIME type for an image file, from its extension then magic bytes. Default image/png. */
export function imageMimeType(name: string, data: Buffer): string {
  const ext = name.toLowerCase().includes(".") ? (name.toLowerCase().split(".").pop() ?? "") : "";
  const byExt = IMAGE_EXTENSIONS.get(ext);
  if (byExt) return byExt;
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
  if (data.length >= 12 && data.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return "image/png";
}

/**
 * Classify by CONTENT, not name — so a misnamed `.txt` that is really a PDF, or
 * an extensionless download, still routes correctly. `%PDF` magic → pdf; a head
 * sample that is NUL-free and overwhelmingly printable (ASCII or UTF-8) → text;
 * anything else → unsupported (binary).
 */
export function sniffFileKind(data: Buffer): FileKind {
  if (data.length === 0) return "unsupported";
  if (data.length >= 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
    return "pdf";
  }
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image";
  if (data.length >= 4 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return "image";
  if (data.length >= 12 && data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "image";
  const sample = data.subarray(0, 4096);
  if (sample.includes(0x00)) return "unsupported";
  let printable = 0;
  for (const byte of sample) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e) || byte >= 0x80) {
      printable += 1;
    }
  }
  return printable / sample.length >= 0.85 ? "text" : "unsupported";
}

/**
 * The kind actually used to read a file: PDF/image magic always wins (catch a
 * mislabeled .txt), then a trusted text/pdf extension, then — for an unknown or
 * missing extension — whatever the bytes say.
 */
export function resolveFileKind(name: string, data: Buffer): FileKind {
  const bySniff = sniffFileKind(data);
  if (bySniff === "pdf" || bySniff === "image") return bySniff;
  const byName = classifyFileKind(name);
  if (byName !== "unsupported") return byName;
  return bySniff;
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
  const scoreName = (name: string): number => {
    if (name === needle) return 100;
    if (name.startsWith(needle)) return 80;
    if (name.includes(needle)) return 60;
    const hits = needleWords.filter((word) => name.includes(word)).length;
    return hits === needleWords.length && hits > 0 ? 40 : hits > 0 ? 10 + hits : 0;
  };
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreName(candidate.name.toLowerCase()) }))
    .filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || b.candidate.modifiedMs - a.candidate.modifiedMs);
  return scored.map((entry) => entry.candidate);
}

const WALK_DEPTH = 3;

export async function walkCandidates(roots: readonly string[]): Promise<readonly FileCandidate[]> {
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
          const { mtimeMs } = await nodeStat(full);
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

export async function extractDocxTextWithMammoth(data: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: data });
  return result.value.replace(/[ \t]+/g, " ").trim();
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'").replace(/&#(\d+);/gu, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, "&"); // ampersand LAST, so "&amp;lt;" round-trips to "&lt;" not "<"
}

/**
 * PPTX is a zip of per-slide XML. Text lives in `<a:t>` runs; slide ORDER is the
 * numeric suffix of `ppt/slides/slideN.xml`, which is NOT the zip's own entry
 * order, so we sort by that number or the deck reads out of sequence. Notes and
 * masters are deliberately skipped — the slides are what the user means by "read
 * the deck".
 */
export async function extractPptxText(data: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .map((path) => ({ match: /^ppt\/slides\/slide(\d+)\.xml$/u.exec(path), path }))
    .filter((entry): entry is { match: RegExpExecArray; path: string } => entry.match !== null)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));

  const parts: string[] = [];
  for (const slide of slides) {
    const entry = zip.files[slide.path];
    if (!entry) continue;
    const xml = await entry.async("string");
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gu)].map((m) => decodeXmlEntities(m[1] ?? ""));
    const text = runs.join(" ").replace(/[ \t]+/g, " ").trim();
    if (text.length > 0) parts.push(text);
  }
  return parts.join("\n").trim();
}

function decodeQuotedPrintable(body: string): string {
  return body
    .replace(/=\r?\n/gu, "") // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/gu, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function decodeTransferEncoding(body: string, encoding: string, charset: string): string {
  const enc = encoding.trim().toLowerCase();
  if (enc === "base64") {
    return Buffer.from(body.replace(/\s+/gu, ""), "base64").toString(charset as BufferEncoding);
  }
  if (enc === "quoted-printable") {
    return Buffer.from(decodeQuotedPrintable(body), "binary").toString(charset as BufferEncoding);
  }
  return body;
}

function stripHtml(html: string): string {
  return decodeXmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/giu, "")
      .replace(/<script[\s\S]*?<\/script>/giu, "")
      .replace(/<br\s*\/?>(?=)/giu, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/giu, "\n")
      .replace(/<[^>]+>/gu, "")
  ).replace(/[ \t]+/gu, " ").replace(/\n[ \t]+/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

interface EmlPart {
  readonly contentType: string;
  readonly charset: string;
  readonly encoding: string;
  readonly body: string;
}

/**
 * RFC2047 encoded-words (`=?utf-8?B?...?=` / `=?...?Q?...?=`) carry non-ASCII
 * header text — a Korean subject arrives this way, so a raw header would show
 * `=?utf-8?B?...?=` instead of the words. Adjacent encoded-words are joined with
 * no separator (RFC2047 §6.2), and `_` is a space in Q-encoding.
 */
function decodeEncodedWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/gu, (_m, charset, enc, text) => {
    try {
      if (enc.toUpperCase() === "B") {
        return Buffer.from(text, "base64").toString(charset as BufferEncoding);
      }
      const bytes = text.replace(/_/gu, " ").replace(/=([0-9A-Fa-f]{2})/gu, (_h: string, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
      return Buffer.from(bytes, "binary").toString(charset as BufferEncoding);
    } catch {
      return _m; // unknown charset ⇒ leave the raw token rather than throw
    }
  });
}

function splitHeadersAndBody(raw: string): { headers: string; body: string } {
  const normalized = raw.replace(/\r\n/gu, "\n");
  const boundary = normalized.indexOf("\n\n");
  if (boundary < 0) return { body: "", headers: normalized };
  return { body: normalized.slice(boundary + 2), headers: normalized.slice(0, boundary) };
}

function parseHeaders(headerBlock: string): Map<string, string> {
  // Unfold RFC822 continuation lines (a header wrapped onto an indented line).
  const unfolded = headerBlock.replace(/\n[ \t]+/gu, " ");
  const headers = new Map<string, string>();
  for (const line of unfolded.split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return headers;
}

function paramFrom(value: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*"?([^;"\\s]+)"?`, "iu").exec(value);
  return match ? match[1] : undefined;
}

/** Flatten a MIME tree into leaf parts. Multipart bodies recurse on their boundary. */
function collectParts(raw: string): readonly EmlPart[] {
  const { headers, body } = splitHeadersAndBody(raw);
  const parsed = parseHeaders(headers);
  const contentType = (parsed.get("content-type") ?? "text/plain").toLowerCase();
  const encoding = parsed.get("content-transfer-encoding") ?? "7bit";
  const charset = paramFrom(parsed.get("content-type") ?? "", "charset") ?? "utf-8";

  if (contentType.startsWith("multipart/")) {
    const boundary = paramFrom(parsed.get("content-type") ?? "", "boundary");
    if (!boundary) return [];
    const segments = body.split(`--${boundary}`).slice(1);
    const out: EmlPart[] = [];
    for (const segment of segments) {
      const trimmed = segment.replace(/^\n/u, "");
      if (trimmed.startsWith("--")) break; // closing delimiter
      out.push(...collectParts(trimmed));
    }
    return out;
  }
  return [{ body, charset, contentType, encoding }];
}

/**
 * EML is RFC822 text, so it is parsed here rather than shelled out: headers,
 * then the readable body. text/plain is preferred over text/html (an HTML mail
 * still yields text with tags stripped), attachments are dropped, and the
 * From/To/Subject/Date headers are prepended because they ARE the content of an
 * email — a body with no "who/when" is not a useful read.
 */
export function extractEmlText(data: Buffer): string {
  const raw = data.toString("utf-8");
  const { headers } = splitHeadersAndBody(raw.replace(/\r\n/gu, "\n"));
  const top = parseHeaders(headers);

  const meta = (["from", "to", "cc", "subject", "date"] as const)
    .map((key) => {
      const value = top.get(key);
      return value ? `${key[0]?.toUpperCase() ?? ""}${key.slice(1)}: ${decodeEncodedWords(value)}` : undefined;
    })
    .filter((line): line is string => line !== undefined);

  const parts = collectParts(raw);
  const decoded = parts.map((part) => ({
    contentType: part.contentType,
    text: decodeTransferEncoding(part.body, part.encoding, part.charset)
  }));
  const plain = decoded.find((part) => part.contentType.startsWith("text/plain"));
  const html = decoded.find((part) => part.contentType.startsWith("text/html"));
  const bodyText = plain
    ? plain.text.replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim()
    : html
      ? stripHtml(html.text)
      : "";

  return [meta.join("\n"), bodyText].filter((section) => section.length > 0).join("\n\n").trim();
}

/**
 * The folders the NAME-fragment read mode searches by default — the user's
 * everyday document folders. Exported so a sibling capability that must read
 * from the SAME allowlist (e.g. `browser_upload`'s path validator) can be wired
 * to the identical roots instead of re-deriving them.
 */
export function defaultFileReadRoots(home: string = homedir()): readonly string[] {
  return [join(home, "Downloads"), join(home, "Desktop"), join(home, "Documents")];
}
