import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "./markdown.js";

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("Markdown", () => {
  it("renders fenced code blocks as <pre><code>", () => {
    const out = html("```\nconst x = 1;\n```");
    expect(out).toContain("<pre");
    expect(out).toContain("const x = 1;");
  });

  it("renders inline bold, italic, and code", () => {
    const out = html("This is **bold**, *italic*, and `code`.");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("code");
    expect(out).toContain("md-code");
  });

  it("renders bullet lists", () => {
    const out = html("- one\n- two");
    expect(out).toContain("<ul");
    expect(out).toContain(">one<");
    expect(out).toContain(">two<");
    expect(out.match(/<li>/g)).toHaveLength(2);
  });

  it("renders safe links and rejects javascript: URLs", () => {
    const safe = html("see [docs](https://example.com)");
    expect(safe).toContain('href="https://example.com"');
    const unsafe = html("[x](javascript:alert(1))");
    expect(unsafe).not.toContain("javascript:");
    expect(unsafe).toContain('href="#"');
  });

  it("never emits a raw script tag from model text", () => {
    const out = html("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
  });
});
