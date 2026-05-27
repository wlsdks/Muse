import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { dailyInboxNotePath, formatCaptureLine, readAllStdin, selectConnections } from "./commands-note.js";

describe("readAllStdin — SB-2: capture a thought piped through stdin (clipboard / pipe)", () => {
  it("concatenates string chunks from a pipe", async () => {
    expect(await readAllStdin(Readable.from(["buy milk ", "after the dentist"]))).toBe("buy milk after the dentist");
  });

  it("concatenates Buffer chunks (binary-safe)", async () => {
    expect(await readAllStdin(Readable.from([Buffer.from("a"), Buffer.from("b")]))).toBe("ab");
  });

  it("preserves newlines (formatCaptureLine collapses them later)", async () => {
    expect(await readAllStdin(Readable.from(["line one\nline two"]))).toBe("line one\nline two");
  });

  it("an empty pipe yields '' (caller then reports nothing to capture)", async () => {
    expect(await readAllStdin(Readable.from([]))).toBe("");
  });

  it("is fail-soft: a stream that errors mid-read yields '' rather than throwing into capture", async () => {
    const boom = Readable.from((async function* () {
      yield "partial";
      throw new Error("stream broke");
    })());
    expect(await readAllStdin(boom)).toBe("");
  });

  it("a piped clipboard snippet round-trips into a single capture bullet", () => {
    // The end-to-end shape: stdin text → formatCaptureLine collapses to one bullet.
    const piped = "  remember:\n  the Acme renewal is due Friday  ";
    expect(formatCaptureLine(piped, new Date("2026-05-27T14:05:00"))).toBe("- 14:05 remember: the Acme renewal is due Friday");
  });
});

describe("selectConnections — SB-3: proactively connect a fresh capture to past knowledge", () => {
  const hits = [
    { ref: "inbox/2026-05-25.md", score: 0.99, snippet: "the just-captured line", source: "notes" as const },
    { ref: "projects/ssl.md", score: 0.72, snippet: "renew prod certs every quarter", source: "notes" as const },
    { ref: "ep1", score: 0.55, snippet: "discussed TLS rotation", source: "episodes" as const },
    { ref: "random.md", score: 0.2, snippet: "unrelated grocery note", source: "notes" as const }
  ];
  it("excludes the self note, drops below-threshold, returns top-N prior matches", () => {
    const out = selectConnections(hits, "inbox/2026-05-25.md", 0.5, 2);
    expect(out.map((h) => h.ref)).toEqual(["projects/ssl.md", "ep1"]);
  });
  it("returns nothing when only the self note matches", () => {
    expect(selectConnections([hits[0]!], "inbox/2026-05-25.md", 0.5, 2)).toEqual([]);
  });
});

describe("dailyInboxNotePath — frictionless capture auto-routes to a daily inbox note", () => {
  it("routes to inbox/YYYY-MM-DD.md by the local date", () => {
    expect(dailyInboxNotePath(new Date("2026-05-25T14:03:00.000Z"))).toMatch(/^inbox\/\d{4}-\d{2}-\d{2}\.md$/);
  });
});

describe("formatCaptureLine — one timestamped bullet per captured thought", () => {
  it("prefixes a local HH:MM timestamp bullet and trims the text", () => {
    const line = formatCaptureLine("  buy milk  ", new Date("2026-05-25T14:03:00.000Z"));
    expect(line).toMatch(/^- \d{2}:\d{2} buy milk$/);
  });
  it("collapses internal newlines so one capture stays one bullet", () => {
    expect(formatCaptureLine("a\nb", new Date("2026-05-25T14:03:00.000Z"))).toMatch(/^- \d{2}:\d{2} a b$/);
  });
});
