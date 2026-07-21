import { isRecord, type JsonObject, type JsonValue } from "@muse/shared";

import type { MuseTool } from "./index.js";

/**
 * Text-formatting tools — the subset of `createMuseTools` whose
 * inputs / outputs are predominantly strings or render-targets
 * (markdown, slugs, key/value summaries, line/word counts). All
 * pure functions, no IO. Helpers (`slugify`, `flattenIntoKv`,
 * `deriveMarkdownTableColumns`, `formatMarkdownTableCell`) live in
 * this file because they're used only by these builders.
 */

export function createTextStatsTool(): MuseTool {
  return {
    definition: {
      description:
        "Returns word, character (user-perceived / grapheme), and line counts for a string. Whitespace-only inputs return zero counts across all dimensions.",
      inputSchema: {
        additionalProperties: false,
        properties: { text: { description: "The text to measure, e.g. the body of a note or a draft message.", type: "string" } },
        required: ["text"],
        type: "object"
      },
      domain: "core",
      keywords: ["text", "count", "statistics", "글자", "단어", "글자수", "통계", "길이"],
      name: "text_stats",
      risk: "read"
    },
    execute: (args): JsonObject => {
      if (typeof args["text"] !== "string") {
        return { error: "text is required and must be a string, e.g. text: 'hello world'" };
      }
      const text = args["text"];
      if (text.trim().length === 0) {
        return { characters: 0, lines: 0, words: 0 } satisfies JsonObject;
      }
      const words = text.trim().split(/\s+/u).filter((segment) => segment.length > 0);
      const lines = text.split(/\r?\n/u).length;
      return {
        characters: countGraphemes(text),
        lines,
        words: words.length
      } satisfies JsonObject;
    }
  };
}

export function createSlugifyTool(): MuseTool {
  return {
    definition: {
      description:
        "Converts free-form `text` into a URL-safe slug: lowercased, with non-alphanumeric runs collapsed to a single '-' and leading/trailing dashes stripped. Optional `maxLength` truncates and re-trims. Empty / whitespace-only inputs return 'untitled'.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          maxLength: {
            description: "Optional positive integer cap on the slug length.",
            type: "number"
          },
          text: { description: "Source text to slugify.", type: "string" }
        },
        required: ["text"],
        type: "object"
      },
      domain: "core",
      keywords: ["slug", "url", "filename", "identifier"],
      name: "slugify",
      risk: "read"
    },
    execute: (args): JsonObject => {
      if (typeof args["text"] !== "string") {
        return { error: "text is required and must be a string, e.g. text: 'My Note Title'" };
      }
      const text = args["text"];
      const rawMaxLength = args["maxLength"];
      let maxLength: number | undefined;
      if (rawMaxLength !== undefined) {
        if (typeof rawMaxLength !== "number" || !Number.isInteger(rawMaxLength) || rawMaxLength <= 0) {
          return { error: "maxLength must be a positive integer number, e.g. 5" };
        }
        maxLength = rawMaxLength;
      }
      return { slug: slugify(text, maxLength) } satisfies JsonObject;
    }
  };
}

export function createKvSummarizeTool(): MuseTool {
  return {
    definition: {
      description:
        "Flattens a JSON object into a `key: value` newline-joined summary. Nested keys are joined with `.`, array indices appear as `.0`, `.1`. Strings, numbers, booleans, and null render directly; nested arrays/objects recurse. Capped at 200 lines (the rest are dropped with a trailing `…(N more)` line). " +
        "Useful when piping a structured tool result into a prose answer without imposing JSON syntax on the model.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          data: { description: "JSON object or array to flatten.", type: "object" }
        },
        required: ["data"],
        type: "object"
      },
      domain: "core",
      keywords: ["summarize", "flatten", "kv", "format"],
      name: "kv_summarize",
      risk: "read"
    },
    execute: (args): JsonObject => {
      const data = args["data"];
      if (data === undefined || data === null) {
        return {
          error: "`data` is required — pass the object/array itself, e.g. data:{\"name\":\"Bob\",\"age\":30}",
          summary: ""
        };
      }
      const lines: string[] = [];
      let truncated = 0;
      flattenIntoKv(toSummaryValue(data), "", (line) => {
        if (lines.length >= KV_SUMMARIZE_MAX_LINES) {
          truncated += 1;
          return;
        }
        lines.push(line);
      });
      if (truncated > 0) {
        lines.push(`…(${truncated} more)`);
      }
      return { summary: lines.join("\n") } satisfies JsonObject;
    }
  };
}

export function createMarkdownTableTool(): MuseTool {
  return {
    definition: {
      description:
        "Renders an array of plain JSON objects as a GitHub-flavored markdown table. " +
        "Columns default to the union of keys from the first 50 rows in first-appearance order; pass `columns` to constrain or reorder them. " +
        "Primitive cells render via String(); a nested object/array cell renders as compact JSON (not '[object Object]'). Pipes and newlines in cells are escaped (`\\|` and `<br/>`). Empty input returns an empty table header. " +
        "Capped at 200 rows; the rest are dropped with a trailing `_…N more rows omitted_` line.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          columns: {
            description: "Optional explicit column order. When omitted, derives from the rows.",
            items: { type: "string" },
            type: "array"
          },
          rows: {
            description: "Array of plain objects to render.",
            items: { type: "object" },
            type: "array"
          }
        },
        required: ["rows"],
        type: "object"
      },
      domain: "core",
      keywords: ["markdown", "table", "format"],
      name: "markdown_table",
      risk: "read"
    },
    execute: (args): JsonObject => {
      const rawRows = Array.isArray(args["rows"]) ? args["rows"] : [];
      const explicitColumns = Array.isArray(args["columns"])
        ? args["columns"].filter((entry): entry is string => typeof entry === "string")
        : undefined;
      const rows: Array<Record<string, unknown>> = [];
      for (const entry of rawRows) {
        if (isRecord(entry)) {
          rows.push(entry);
        }
      }
      const derivedColumns = deriveMarkdownTableColumns(rows);
      let columns: string[];
      let columnWarning: string | undefined;
      if (explicitColumns && explicitColumns.length > 0) {
        const requested = Array.from(new Set(explicitColumns));
        if (rows.length === 0) {
          // Nothing to intersect against yet — an explicit header-only
          // table (no rows) is a legitimate request, not a typo.
          columns = requested;
        } else {
          const available = new Set(derivedColumns);
          const matched = requested.filter((column) => available.has(column));
          const missing = requested.filter((column) => !available.has(column));
          if (matched.length === 0) {
            return {
              error: `none of the requested columns exist in \`rows\`; available columns are: ${derivedColumns.join(", ")} — pass \`columns\` using those exact key names, or omit \`columns\` to use all of them`,
              markdown: ""
            } satisfies JsonObject;
          }
          columns = matched;
          if (missing.length > 0) {
            columnWarning = `columns not found in rows: ${missing.join(", ")}`;
          }
        }
      } else {
        columns = derivedColumns;
      }
      if (columns.length === 0) {
        return { markdown: "" } satisfies JsonObject;
      }
      const lines: string[] = [];
      lines.push(`| ${columns.map((column) => formatMarkdownTableCell(column)).join(" | ")} |`);
      lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
      const truncated = Math.max(0, rows.length - MARKDOWN_TABLE_MAX_ROWS);
      const visibleRows = truncated > 0 ? rows.slice(0, MARKDOWN_TABLE_MAX_ROWS) : rows;
      for (const row of visibleRows) {
        const cells = columns.map((column) => formatMarkdownTableCell(row[column]));
        lines.push(`| ${cells.join(" | ")} |`);
      }
      if (truncated > 0) {
        lines.push(`_…${truncated} more rows omitted_`);
      }
      const markdown = lines.join("\n");
      return columnWarning
        ? ({ markdown, warning: columnWarning } satisfies JsonObject)
        : ({ markdown } satisfies JsonObject);
    }
  };
}

const KV_SUMMARIZE_MAX_LINES = 200;
export const KV_SUMMARIZE_MAX_DEPTH = 32;
const MARKDOWN_TABLE_MAX_ROWS = 200;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Count user-perceived characters, not UTF-16 code units: one emoji,
// flag, or combining/Hangul-jamo sequence is a single character to the
// user but 2+ code units, so `text.length` over-counts. Intl.Segmenter
// is built in (no dependency) and handles grapheme clusters per UAX#29.
function countGraphemes(text: string): number {
  let count = 0;
  for (const _segment of graphemeSegmenter.segment(text)) {
    count += 1;
  }
  return count;
}

function slugify(text: string, maxLength?: number): string {
  const trimmed = text.normalize("NFKD").replace(/[̀-ͯ]/gu, "");
  const reduced = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (reduced.length === 0) {
    return "untitled";
  }
  if (maxLength === undefined || reduced.length <= maxLength) {
    return reduced;
  }
  const truncated = reduced.slice(0, maxLength).replace(/-+$/u, "");
  return truncated.length > 0 ? truncated : reduced.slice(0, maxLength);
}

function flattenIntoKv(value: JsonValue, prefix: string, emit: (line: string) => void, depth: number = 0): void {
  if (depth >= KV_SUMMARIZE_MAX_DEPTH) {
    emit(`${prefix || "value"}: [deep]`);
    return;
  }
  if (value === null || value === undefined) {
    emit(`${prefix || "value"}: null`);
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    emit(`${prefix || "value"}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      emit(`${prefix || "value"}: []`);
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      const child = value[index];
      const nextPrefix = prefix.length > 0 ? `${prefix}.${index}` : String(index);
      flattenIntoKv(toSummaryValue(child), nextPrefix, emit, depth + 1);
    }
    return;
  }
  if (!isRecord(value)) {
    emit(`${prefix || "value"}: ${JSON.stringify(value) ?? ""}`);
    return;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    emit(`${prefix || "value"}: {}`);
    return;
  }
  for (const [key, child] of entries) {
    const nextPrefix = prefix.length > 0 ? `${prefix}.${key}` : key;
    flattenIntoKv(toSummaryValue(child), nextPrefix, emit, depth + 1);
  }
}

function toSummaryValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  // flattenIntoKv re-derives shape at each recursion step (Array.isArray /
  // isRecord guards), so a container value only needs to be narrowed to
  // "array or record" here — the deep JsonValue shape is validated lazily
  // as flattenIntoKv walks each child.
  if (Array.isArray(value) || isRecord(value)) {
    return value as JsonValue;
  }
  return null;
}

function deriveMarkdownTableColumns(rows: readonly Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (let index = 0; index < rows.length && index < 50; index += 1) {
    const row = rows[index];
    if (!row) {
      continue;
    }
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

function formatMarkdownTableCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  // A nested object/array cell via String() becomes "[object Object]"
  // (or a comma-joined array that loses structure) — useless in a table
  // the model shows the user. Render it as compact JSON instead.
  const rendered = typeof value === "object" ? (JSON.stringify(value) ?? "") : String(value);
  return rendered.replace(/\|/gu, "\\|").replace(/\r?\n/gu, "<br/>");
}
