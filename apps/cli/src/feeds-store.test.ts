import { describe, expect, it } from "vitest";

import { parseFeedBody } from "./feeds-store.js";

describe("parseFeedBody — RSS 2.0", () => {
  it("maps channel/item to uniform entries (guid > link > title for id)", () => {
    const body = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>Site</title>
      <item><title>First</title><link>https://x/1</link><guid>g-1</guid>
        <pubDate>Tue, 19 May 2026 09:00:00 GMT</pubDate><description>One</description></item>
      <item><title>Second</title><link>https://x/2</link><description>Two</description></item>
    </channel></rss>`;
    const entries = parseFeedBody(body);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: "g-1",
      link: "https://x/1",
      publishedAt: "Tue, 19 May 2026 09:00:00 GMT",
      summary: "One",
      title: "First"
    });
    // no guid ⇒ id falls back to link
    expect(entries[1]!.id).toBe("https://x/2");
  });

  it("drops items with neither title nor id", () => {
    const body = `<rss version="2.0"><channel><item><description>orphan</description></item></channel></rss>`;
    expect(parseFeedBody(body)).toEqual([]);
  });
});

describe("parseFeedBody — Atom link rel selection (RFC 4287 §4.2.7.2)", () => {
  it("picks the rel=alternate permalink even when rel=self is listed FIRST", () => {
    const body = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Post</title>
        <id>tag:x,2026:1</id>
        <link rel="self" href="https://x/feed.xml"/>
        <link rel="alternate" href="https://x/post/1"/>
        <link rel="edit" href="https://x/api/1"/>
        <updated>2026-05-19T09:00:00Z</updated>
        <summary>Body</summary>
      </entry>
    </feed>`;
    const [entry] = parseFeedBody(body);
    expect(entry!.link).toBe("https://x/post/1");
    expect(entry!.id).toBe("tag:x,2026:1");
    expect(entry!.publishedAt).toBe("2026-05-19T09:00:00Z");
  });

  it("treats a rel-less link as alternate (the RFC default)", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>P</title><id>i1</id><link href="https://x/only"/><summary>s</summary></entry>
    </feed>`;
    expect(parseFeedBody(body)[0]!.link).toBe("https://x/only");
  });

  it("falls back to the first href when NO alternate exists (malformed feed, entry not dropped)", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>P</title><id>i2</id>
        <link rel="self" href="https://x/self.xml"/>
        <link rel="edit" href="https://x/api/2"/>
        <summary>s</summary></entry>
    </feed>`;
    const [entry] = parseFeedBody(body);
    expect(entry!.link).toBe("https://x/self.xml");
  });

  it("prefers <updated> over <published>, and <summary> over <content>", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>P</title><id>i3</id><link href="https://x/3"/>
        <published>2026-01-01T00:00:00Z</published>
        <updated>2026-05-19T10:00:00Z</updated>
        <summary>the summary</summary>
        <content>the content</content>
      </entry>
    </feed>`;
    const [entry] = parseFeedBody(body);
    expect(entry!.publishedAt).toBe("2026-05-19T10:00:00Z");
    expect(entry!.summary).toBe("the summary");
  });
});

describe("parseFeedBody — robustness", () => {
  it("returns [] for malformed XML, non-feed roots, and empty input", () => {
    expect(parseFeedBody("<rss><channel><item><title>x")).toEqual([]);
    expect(parseFeedBody("<html><body>not a feed</body></html>")).toEqual([]);
    expect(parseFeedBody("")).toEqual([]);
  });

  it("reads element text when fast-xml-parser yields {#text} (title with attributes)", () => {
    const body = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title type="html">Hello &amp; Co</title><id>i4</id><link href="https://x/4"/></entry>
    </feed>`;
    const [entry] = parseFeedBody(body);
    expect(entry!.title).toBe("Hello & Co");
  });
});
