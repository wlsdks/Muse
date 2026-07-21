import type { JsonObject } from "@muse/shared";
import { describe, expect, it } from "vitest";

import type { MuseTool } from "./index.js";
import {
  createKvSummarizeTool,
  createMarkdownTableTool,
  createSlugifyTool,
  createTextStatsTool,
  KV_SUMMARIZE_MAX_DEPTH
} from "./muse-tools-text.js";

const ctx = { runId: "test" } as const;
const call = (tool: MuseTool, args: JsonObject) =>
  tool.execute(args, ctx) as Record<string, unknown>;

describe("text_stats", () => {
  it("counts words, graphemes, and lines for a multi-line string", () => {
    expect(call(createTextStatsTool(), { text: "hello world\nsecond line" }))
      .toEqual({ characters: 23, lines: 2, words: 4 });
  });

  it("counts a user-perceived grapheme (emoji / flag / ZWJ sequence) as one character, not its UTF-16 length", () => {
    // "👍" is 2 UTF-16 code units; "🇰🇷" (regional-indicator flag) is 4.
    expect((call(createTextStatsTool(), { text: "👍" }))["characters"]).toBe(1);
    expect((call(createTextStatsTool(), { text: "🇰🇷" }))["characters"]).toBe(1);
    // a + family-emoji (man-ZWJ-woman-ZWJ-girl, many code units) + b → 3 graphemes.
    // \u escapes so the source carries no raw zero-width (ZWJ) byte (byte-hygiene gate).
    expect((call(createTextStatsTool(), { text: "a\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}b" }))["characters"]).toBe(3);
  });

  it("returns zero across all dimensions for whitespace-only / empty input", () => {
    expect(call(createTextStatsTool(), { text: "   \n\t " })).toEqual({ characters: 0, lines: 0, words: 0 });
    expect(call(createTextStatsTool(), { text: "" })).toEqual({ characters: 0, lines: 0, words: 0 });
  });

  it("errors on a missing/non-string `text` instead of silently measuring an empty string", () => {
    // A dropped required argument must not be indistinguishable from a real
    // zero-length measurement — that reads as a fabricated fact about input
    // the tool never received.
    expect(call(createTextStatsTool(), {})).toEqual({
      error: "text is required and must be a string, e.g. text: 'hello world'"
    });
    expect(call(createTextStatsTool(), { text: 123 })).toEqual({
      error: "text is required and must be a string, e.g. text: 'hello world'"
    });
  });
});

describe("slugify", () => {
  it("lowercases, collapses non-alphanumeric runs to a single dash, strips edges", () => {
    expect(call(createSlugifyTool(), { text: "  Hello,  World!! " })["slug"]).toBe("hello-world");
  });

  it("strips diacritics via NFKD so accented text becomes ascii", () => {
    expect(call(createSlugifyTool(), { text: "Café Crème" })["slug"]).toBe("cafe-creme");
  });

  it("returns 'untitled' for empty / whitespace / punctuation-only input", () => {
    expect(call(createSlugifyTool(), { text: "" })["slug"]).toBe("untitled");
    expect(call(createSlugifyTool(), { text: "   " })["slug"]).toBe("untitled");
    expect(call(createSlugifyTool(), { text: "!!!" })["slug"]).toBe("untitled");
  });

  it("truncates to maxLength and re-trims a trailing dash left by the cut", () => {
    // "one-two-three" sliced to 8 = "one-two-" → trailing dash stripped → "one-two".
    expect(call(createSlugifyTool(), { text: "one two three", maxLength: 8 })["slug"]).toBe("one-two");
  });

  it("errors on a non-positive/non-integer maxLength instead of silently ignoring it", () => {
    // A supplied-but-unusable argument must be named, not dropped — a caller
    // who asked for maxLength: 0 and got the untruncated slug back would
    // never learn their cap had no effect.
    expect(call(createSlugifyTool(), { maxLength: 0, text: "one two three" })).toEqual({
      error: "maxLength must be a positive integer, e.g. 5"
    });
    expect(call(createSlugifyTool(), { maxLength: -5, text: "one two three" })).toEqual({
      error: "maxLength must be a positive integer, e.g. 5"
    });
    expect(call(createSlugifyTool(), { maxLength: "abc", text: "one two three" })).toEqual({
      error: "maxLength must be a positive integer, e.g. 5"
    });
  });

  it("REPAIRS a quoted number rather than refusing it", () => {
    // The small local model quotes numbers routinely. Refusing "5" here while
    // time_add / muse.tasks.list / upcoming_birthdays all accept their quoted
    // form would make the same model output succeed against one tool and fail
    // against its sibling; apps/cli/src/tool-numeric-string-repair.test.ts
    // pins the rule across the registry.
    expect(call(createSlugifyTool(), { maxLength: "5", text: "one two three" }))
      .toEqual(call(createSlugifyTool(), { maxLength: 5, text: "one two three" }));
  });

  it("errors on a missing/non-string text", () => {
    expect(call(createSlugifyTool(), {})).toEqual({
      error: "text is required and must be a string, e.g. text: 'My Note Title'"
    });
    expect(call(createSlugifyTool(), { text: 42 })).toEqual({
      error: "text is required and must be a string, e.g. text: 'My Note Title'"
    });
  });
});

describe("kv_summarize", () => {
  it("flattens nested objects (dot keys) and arrays (.N indices)", () => {
    const out = call(createKvSummarizeTool(), {
      data: { user: { name: "Bob", roles: ["admin", "ops"] }, active: true, note: null } as unknown as JsonObject
    });
    expect(out["summary"]).toBe("user.name: Bob\nuser.roles.0: admin\nuser.roles.1: ops\nactive: true\nnote: null");
  });

  it("renders empty array / object / null leaves explicitly", () => {
    const out = call(createKvSummarizeTool(), { data: { a: [], b: {}, c: null } as unknown as JsonObject });
    expect(out["summary"]).toBe("a: []\nb: {}\nc: null");
  });

  it("errors on missing/null data instead of a silent empty summary", () => {
    // Absent `data` (e.g. the model sent `json:` instead of `data:`) must not
    // read the same as a legitimately empty object — there is no basis to
    // retry with the right key without the error.
    expect(call(createKvSummarizeTool(), { data: null as unknown as JsonObject })).toEqual({
      error: "`data` is required — pass the object/array itself, e.g. data:{\"name\":\"Bob\",\"age\":30}",
      summary: ""
    });
    expect(call(createKvSummarizeTool(), {})).toEqual({
      error: "`data` is required — pass the object/array itself, e.g. data:{\"name\":\"Bob\",\"age\":30}",
      summary: ""
    });
  });

  it("caps recursion at KV_SUMMARIZE_MAX_DEPTH with a [deep] marker", () => {
    let nested: Record<string, unknown> = { leaf: "bottom" };
    for (let i = 0; i < KV_SUMMARIZE_MAX_DEPTH + 2; i += 1) {
      nested = { down: nested };
    }
    const out = call(createKvSummarizeTool(), { data: nested as unknown as JsonObject })["summary"] as string;
    expect(out).toContain("[deep]");
    expect(out).not.toContain("bottom");
  });

  it("caps output at 200 lines with a trailing …(N more)", () => {
    const data: Record<string, number> = {};
    for (let i = 0; i < 250; i += 1) {
      data[`k${i}`] = i;
    }
    const lines = (call(createKvSummarizeTool(), { data: data as unknown as JsonObject })["summary"] as string).split("\n");
    expect(lines).toHaveLength(201);
    expect(lines[200]).toBe("…(50 more)");
  });
});

describe("markdown_table", () => {
  it("renders rows with derived columns in first-appearance order", () => {
    const out = call(createMarkdownTableTool(), {
      rows: [{ name: "Bob", age: 30 }, { name: "Amy", age: 25 }] as unknown as JsonObject[]
    })["markdown"];
    expect(out).toBe("| name | age |\n| --- | --- |\n| Bob | 30 |\n| Amy | 25 |");
  });

  it("derives the column UNION across rows with differing keys and leaves an absent cell empty", () => {
    // row1 has a,b; row2 has a,c → union a,b,c; each row's missing key renders as
    // an empty cell (exercises the merge-across-rows + undefined→"" fill).
    const out = call(createMarkdownTableTool(), {
      rows: [{ a: 1, b: 2 }, { a: 3, c: 4 }] as unknown as JsonObject[]
    })["markdown"];
    expect(out).toBe("| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |  |\n| 3 |  | 4 |");
  });

  it("renders a nested object/array cell as compact JSON, not [object Object]", () => {
    const out = call(createMarkdownTableTool(), {
      rows: [{ k: { x: 1 } }, { k: [1, 2] }] as unknown as JsonObject[]
    })["markdown"] as string;
    expect(out).toContain('| {"x":1} |');
    expect(out).toContain("| [1,2] |");
    expect(out).not.toContain("[object Object]");
  });

  it("escapes pipes and newlines inside cells so the table grid survives", () => {
    const out = call(createMarkdownTableTool(), {
      rows: [{ c: "a|b\nc" }] as unknown as JsonObject[]
    })["markdown"] as string;
    expect(out).toContain("a\\|b<br/>c");
  });

  it("honours explicit columns (order + dedupe) and leaves missing cells empty", () => {
    const out = call(createMarkdownTableTool(), {
      columns: ["age", "name", "age"] as unknown as JsonObject[],
      rows: [{ name: "Bob", age: 30, extra: "x" }] as unknown as JsonObject[]
    })["markdown"];
    expect(out).toBe("| age | name |\n| --- | --- |\n| 30 | Bob |");
  });

  it("returns an empty string when there are no columns to render", () => {
    expect(call(createMarkdownTableTool(), { rows: [] as unknown as JsonObject[] })["markdown"]).toBe("");
  });

  it("caps at 200 rows with a trailing omitted-count line", () => {
    const rows = Array.from({ length: 250 }, (_v, i) => ({ i }));
    const lines = (call(createMarkdownTableTool(), { rows: rows as unknown as JsonObject[] })["markdown"] as string).split("\n");
    // header + separator + 200 rows + 1 omitted-count line
    expect(lines).toHaveLength(203);
    expect(lines[202]).toBe("_…50 more rows omitted_");
  });

  it("errors when NONE of the explicit columns exist in the rows, instead of rendering a data-free table", () => {
    // A syntactically valid table with every cell blank is a success-shaped
    // answer over data that was silently dropped — the caller needs the
    // real column names, not a table that looks fine and says nothing.
    const out = call(createMarkdownTableTool(), {
      columns: ["A", "bee"] as unknown as JsonObject[],
      rows: [{ a: 1, b: 2 }] as unknown as JsonObject[]
    });
    expect(out).toEqual({
      error: "none of the requested columns exist in `rows`; available columns are: a, b — pass `columns` using those exact key names, or omit `columns` to use all of them",
      markdown: ""
    });
  });

  it("warns (but still renders) when SOME explicit columns are missing from the rows", () => {
    const out = call(createMarkdownTableTool(), {
      columns: ["a", "bee"] as unknown as JsonObject[],
      rows: [{ a: 1, b: 2 }] as unknown as JsonObject[]
    });
    expect(out["markdown"]).toBe("| a |\n| --- |\n| 1 |");
    expect(out["warning"]).toBe("columns not found in rows: bee");
  });

  it("renders a header-only table from explicit columns when rows is genuinely empty (not an error)", () => {
    const out = call(createMarkdownTableTool(), {
      columns: ["a", "b"] as unknown as JsonObject[],
      rows: [] as unknown as JsonObject[]
    });
    expect(out).toEqual({ markdown: "| a | b |\n| --- | --- |" });
  });
});
