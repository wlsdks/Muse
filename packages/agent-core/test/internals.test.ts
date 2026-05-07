import { describe, expect, it } from "vitest";

import {
  extractApologyLead,
  isRecord,
  isSignificantCountMismatch,
  joinMessages,
  joinUserMessages,
  normalizeSourceUrl,
  parseJsonObjectFromText,
  parseLlmClassificationDecision,
  resolveActualResponseCount,
  splitOnCodeFences,
  splitPreservingSentencePunctuation,
  stringField,
  transformMarkdownText,
  withResponseFilterRaw
} from "../src/internals.js";

describe("isRecord", () => {
  it("recognises plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rejects arrays, primitives, and null/undefined", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
  });
});

describe("stringField", () => {
  it("returns the trimmed presence of a non-empty string and undefined otherwise", () => {
    expect(stringField("muse")).toBe("muse");
    expect(stringField("")).toBeUndefined();
    expect(stringField("   ")).toBeUndefined();
    expect(stringField(42)).toBeUndefined();
    expect(stringField(undefined)).toBeUndefined();
  });
});

describe("joinMessages and joinUserMessages", () => {
  const messages = [
    { content: "system", role: "system" } as const,
    { content: "user1", role: "user" } as const,
    { content: "asst", role: "assistant" } as const,
    { content: "user2", role: "user" } as const
  ];

  it("joinMessages keeps system + user content joined by newline", () => {
    expect(joinMessages(messages)).toBe("system\nuser1\nuser2");
  });

  it("joinUserMessages keeps only user content", () => {
    expect(joinUserMessages(messages)).toBe("user1\nuser2");
  });

  it("returns empty string for an empty array", () => {
    expect(joinMessages([])).toBe("");
    expect(joinUserMessages([])).toBe("");
  });
});

describe("parseLlmClassificationDecision", () => {
  it("parses 'allow' with category and reason", () => {
    const decision = parseLlmClassificationDecision('{"action":"allow","category":"ok","reason":"safe"}');
    expect(decision).toEqual({ action: "allow", category: "ok", reason: "safe" });
  });

  it("parses 'block' / 'deny' / 'reject' synonyms as block", () => {
    expect(parseLlmClassificationDecision('{"action":"deny","reason":"no"}')).toMatchObject({
      action: "block",
      reason: "no"
    });
    expect(parseLlmClassificationDecision('{"action":"reject"}').action).toBe("block");
    expect(parseLlmClassificationDecision('{"action":"block"}').action).toBe("block");
  });

  it("throws on unknown actions or unparseable input", () => {
    expect(() => parseLlmClassificationDecision('{"action":"maybe"}')).toThrow(/unknown action/u);
    expect(() => parseLlmClassificationDecision("not json")).toThrow();
  });
});

describe("parseJsonObjectFromText", () => {
  it("parses a bare JSON object", () => {
    expect(parseJsonObjectFromText('{"a":1}')).toEqual({ a: 1 });
  });

  it("extracts a JSON object from a fenced code block", () => {
    expect(parseJsonObjectFromText('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("falls back to the first { ... } substring when surrounded by prose", () => {
    expect(parseJsonObjectFromText("Here you go: {\"a\":3} ok?")).toEqual({ a: 3 });
  });

  it("returns undefined when nothing parses", () => {
    expect(parseJsonObjectFromText("nope")).toBeUndefined();
    expect(parseJsonObjectFromText("[1,2,3]")).toBeUndefined(); // arrays not records
  });
});

describe("withResponseFilterRaw", () => {
  it("preserves existing raw fields and stamps the museResponseFilter id", () => {
    const result = withResponseFilterRaw(
      { id: "r-1", model: "m", output: "o", raw: { existing: true } },
      "filter-x"
    );
    expect(result).toEqual({ existing: true, museResponseFilter: { id: "filter-x" } });
  });

  it("ignores non-record raw payloads", () => {
    const result = withResponseFilterRaw(
      { id: "r-2", model: "m", output: "o", raw: "string-raw" as unknown as never },
      "filter-y"
    );
    expect(result).toEqual({ museResponseFilter: { id: "filter-y" } });
  });
});

describe("splitOnCodeFences", () => {
  it("splits prose and code segments preserving fence markers", () => {
    const segments = splitOnCodeFences("before ```js\nconst x = 1;\n``` after");
    expect(segments.map((s) => s.isCode)).toEqual([false, true, false]);
    expect(segments[1]?.text).toContain("const x = 1");
  });

  it("treats input with no fences as a single non-code segment", () => {
    expect(splitOnCodeFences("just text")).toEqual([{ isCode: false, text: "just text" }]);
  });
});

describe("transformMarkdownText", () => {
  it("converts bold markers to single-asterisk style", () => {
    expect(transformMarkdownText("**bold**")).toBe("*bold*");
  });

  it("turns headings into single-asterisk inline emphasis", () => {
    expect(transformMarkdownText("## My Heading\nbody")).toContain("*My Heading*");
  });

  it("rewrites markdown links into Slack mrkdwn link syntax", () => {
    expect(transformMarkdownText("[Muse](https://example.com)"))
      .toContain("<https://example.com|Muse>");
  });

  it("strips horizontal-rule separator lines", () => {
    expect(transformMarkdownText("body\n---\ntail")).not.toContain("---");
  });
});

describe("splitPreservingSentencePunctuation", () => {
  it("splits on terminal punctuation but keeps the punctuation attached", () => {
    expect(splitPreservingSentencePunctuation("First. Second! Third?")).toEqual([
      "First.",
      "Second!",
      "Third?"
    ]);
  });

  it("filters fragments that contain no letters", () => {
    expect(splitPreservingSentencePunctuation("...")).toEqual([]);
  });

  it("preserves a tail without terminal punctuation", () => {
    expect(splitPreservingSentencePunctuation("Hello there")).toEqual(["Hello there"]);
  });
});

describe("extractApologyLead", () => {
  it("returns the lead paragraph when it matches one of the apology patterns", () => {
    const lead = extractApologyLead("I am sorry, but I cannot help.\n\nMore detail.", ["sorry", "apologize"]);
    expect(lead).toBe("I am sorry, but I cannot help.");
  });

  it("returns undefined when no pattern matches", () => {
    expect(extractApologyLead("Sure thing.\n\nBody.", ["sorry"])).toBeUndefined();
  });

  it("returns undefined for a candidate longer than 300 characters", () => {
    const long = "sorry " + "x".repeat(400);
    expect(extractApologyLead(`${long}\n\nrest`, ["sorry"])).toBeUndefined();
  });
});

describe("resolveActualResponseCount", () => {
  it("prefers the verifiedSources count when sources are present", () => {
    expect(
      resolveActualResponseCount("body", [
        { title: "a", url: "https://example.com/a" },
        { title: "b", url: "https://example.com/b" }
      ])
    ).toBe(2);
  });

  it("falls back to a bullet count", () => {
    expect(resolveActualResponseCount("- one\n- two\n- three", [])).toBe(3);
  });

  it("falls back to a unique URL count when no bullets are present", () => {
    expect(
      resolveActualResponseCount(
        "see https://example.com/a and https://example.com/b and https://example.com/a",
        []
      )
    ).toBe(2);
  });

  it("returns 0 when the body declares 'not found' / Korean equivalents", () => {
    expect(resolveActualResponseCount("검색 결과 0건입니다.", [])).toBe(0);
    expect(resolveActualResponseCount("not found", [])).toBe(0);
  });

  it("returns -1 when nothing is countable", () => {
    expect(resolveActualResponseCount("uncountable prose", [])).toBe(-1);
  });
});

describe("isSignificantCountMismatch", () => {
  it("flags when asserted is positive but actual is zero", () => {
    expect(isSignificantCountMismatch(5, 0)).toBe(true);
  });

  it("flags when the gap is at least 2", () => {
    expect(isSignificantCountMismatch(5, 7)).toBe(true);
    expect(isSignificantCountMismatch(7, 5)).toBe(true);
  });

  it("does not flag a one-off gap when actual is non-zero", () => {
    expect(isSignificantCountMismatch(5, 6)).toBe(false);
    expect(isSignificantCountMismatch(5, 4)).toBe(false);
  });
});

describe("normalizeSourceUrl", () => {
  it("strips fragments and trailing slashes", () => {
    expect(normalizeSourceUrl("https://example.com/page/")).toBe("https://example.com/page");
    expect(normalizeSourceUrl("https://example.com/page#section")).toBe("https://example.com/page");
    expect(normalizeSourceUrl("https://example.com/page/#section")).toBe("https://example.com/page");
  });

  it("leaves a clean URL untouched", () => {
    expect(normalizeSourceUrl("https://example.com/a/b")).toBe("https://example.com/a/b");
  });
});
