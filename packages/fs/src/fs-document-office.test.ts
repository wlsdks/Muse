/**
 * PPTX and EML extraction. Both were in the "unsupported" branch, so a user who
 * pointed file_read at a deck or a saved email got a refusal. These prove the
 * two things the audit named as likely to be wrong: pptx must read in SLIDE
 * order (not zip-entry order), and an eml body must be decoded (base64,
 * quoted-printable, RFC2047 headers) rather than handed back raw.
 *
 * Fixtures are built in-test with the same jszip the extractor uses, so the
 * assertion is against real OOXML structure, not a mock.
 */

import { describe, expect, it } from "vitest";

import { classifyFileKind, extractEmlText, extractPptxText, resolveFileKind } from "./fs-document.js";

async function buildPptx(slides: Record<string, readonly string[]>): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<?xml version=\"1.0\"?><Types/>");
  for (const [path, runs] of Object.entries(slides)) {
    zip.file(path, `<?xml version="1.0"?><p:sld xmlns:a="x">${runs.map((run) => `<a:t>${run}</a:t>`).join("")}</p:sld>`);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("extractPptxText", () => {
  it("reads slides in SLIDE-NUMBER order even when zip entries are added out of order", async () => {
    const pptx = await buildPptx({
      "ppt/slides/slide10.xml": ["Tenth"],
      "ppt/slides/slide2.xml": ["Second"],
      "ppt/slides/slide1.xml": ["First", "of many"]
    });
    // Added 10, 2, 1 — must come back 1, 2, 10, not the insertion order.
    expect(await extractPptxText(pptx)).toBe("First of many\nSecond\nTenth");
  });

  it("decodes XML entities in a run and skips empty slides", async () => {
    const pptx = await buildPptx({
      "ppt/slides/slide1.xml": ["A &amp; B &lt;tag&gt;"],
      "ppt/slides/slide2.xml": [""]
    });
    expect(await extractPptxText(pptx)).toBe("A & B <tag>");
  });

  it("ignores notes and masters — only the slides are the deck", async () => {
    const pptx = await buildPptx({
      "ppt/notesSlides/notesSlide1.xml": ["speaker note, do not read"],
      "ppt/slides/slide1.xml": ["visible content"]
    });
    expect(await extractPptxText(pptx)).toBe("visible content");
  });

  it("classifies a .pptx by extension (a PK zip cannot be told from docx by bytes)", async () => {
    const pptx = await buildPptx({ "ppt/slides/slide1.xml": ["x"] });
    expect(classifyFileKind("deck.pptx")).toBe("pptx");
    expect(resolveFileKind("deck.pptx", pptx)).toBe("pptx");
  });
});

describe("extractEmlText", () => {
  it("prepends the From/To/Subject/Date headers — an email body with no who/when is not a useful read", () => {
    const eml = Buffer.from(
      "From: Ada <ada@example.com>\r\n" +
      "To: Stark <stark@example.com>\r\n" +
      "Subject: Lunch\r\n" +
      "Date: Mon, 20 Jul 2026 09:00:00 +0000\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n\r\n" +
      "See you at noon.\r\n",
      "utf-8"
    );
    const text = extractEmlText(eml);
    expect(text).toContain("From: Ada <ada@example.com>");
    expect(text).toContain("Subject: Lunch");
    expect(text).toContain("See you at noon.");
  });

  it("decodes a quoted-printable body, including =0D=0A newlines and escaped punctuation", () => {
    const eml = Buffer.from(
      "Subject: x\r\nContent-Type: text/plain; charset=utf-8\r\n" +
      "Content-Transfer-Encoding: quoted-printable\r\n\r\n" +
      "Let=27s ship =E2=9C=85 today.\r\n",
      "utf-8"
    );
    expect(extractEmlText(eml)).toContain("Let's ship ✅ today.");
  });

  it("prefers text/plain over text/html in a multipart body, and base64-decodes it", () => {
    const boundary = "B0uNd";
    const body = Buffer.from("회의는 3시입니다.", "utf-8").toString("base64");
    const eml = Buffer.from(
      "Subject: 회의\r\n" +
      `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
      `--${boundary}\r\nContent-Type: text/html\r\n\r\n<p>ignore</p>\r\n` +
      `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n` +
      `--${boundary}--\r\n`,
      "utf-8"
    );
    const text = extractEmlText(eml);
    expect(text).toContain("회의는 3시입니다.");
    expect(text).not.toContain("ignore");
  });

  it("falls back to text/html with tags stripped when there is no plain part", () => {
    const eml = Buffer.from(
      "Subject: html only\r\nContent-Type: text/html; charset=utf-8\r\n\r\n" +
      "<html><body><p>Line one</p><p>Line two</p></body></html>\r\n",
      "utf-8"
    );
    const text = extractEmlText(eml);
    expect(text).toContain("Line one");
    expect(text).toContain("Line two");
    expect(text).not.toContain("<p>");
  });

  it("decodes an RFC2047 encoded-word subject (how a Korean subject arrives)", () => {
    const eml = Buffer.from(
      "Subject: =?utf-8?B?7ZqM7J2YIOydvOyglQ==?=\r\n" +
      "Content-Type: text/plain\r\n\r\nbody\r\n",
      "utf-8"
    );
    expect(extractEmlText(eml)).toContain("Subject: 회의 일정");
  });

  it("classifies a .eml by extension", () => {
    expect(classifyFileKind("note.eml")).toBe("eml");
  });
});
