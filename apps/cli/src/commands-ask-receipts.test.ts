import { describe, expect, it } from "vitest";

import { formatSourceReceipts, provenanceDate, provenanceSnippet } from "./commands-ask.js";

describe("provenanceDate / provenanceSnippet — deterministic memory render", () => {
  it("parses a YYYY-MM-DD date from a note filename, undefined when absent", () => {
    expect(provenanceDate("2026-03-03-vpn-wireguard.md")).toBe("2026-03-03");
    expect(provenanceDate("journal/2026-05-01.md")).toBe("2026-05-01");
    expect(provenanceDate("preferences.md")).toBeUndefined();
  });

  it("collapses whitespace and truncates a long snippet with an ellipsis", () => {
    expect(provenanceSnippet("MTU   1380\n  to avoid\tfragmentation")).toBe("MTU 1380 to avoid fragmentation");
    expect(provenanceSnippet("x".repeat(200), 90)).toHaveLength(91); // 90 chars + …
    expect(provenanceSnippet("x".repeat(200), 90).endsWith("…")).toBe(true);
  });
});

describe("formatSourceReceipts — S1 citation-as-voice (date + verbatim snippet + openable path)", () => {
  const chunks = [
    { file: "2026-03-03-vpn-wireguard.md", text: "WireGuard VPN MTU is 1380 to avoid fragmentation over the LTE backup link." },
    { file: "tasks/finances.md", text: "Rent is due on the 25th, $1,450." }
  ];

  it("renders a dated memory + verbatim snippet + openable path for each cited note", () => {
    const out = formatSourceReceipts(
      "MTU is 1380 [from 2026-03-03-vpn-wireguard.md].",
      "/home/u/.muse/notes",
      chunks
    );
    expect(out).toContain("📎 From your notes");
    expect(out).toContain("from your note of 2026-03-03");
    expect(out).toContain('"WireGuard VPN MTU is 1380'); // verbatim snippet
    expect(out).toContain("/home/u/.muse/notes/2026-03-03-vpn-wireguard.md"); // openable
  });

  it("falls back to the note name when the filename has no date", () => {
    const out = formatSourceReceipts("Rent is due [from tasks/finances.md].", "/n", chunks);
    expect(out).toContain("from finances.md");
    expect(out).toContain('"Rent is due on the 25th');
  });

  it("returns undefined when the answer cites nothing (a refusal renders no receipt)", () => {
    expect(formatSourceReceipts("I don't have anything on that.", "/n", chunks)).toBeUndefined();
  });

  it("omits the snippet when no grounded chunk matches (e.g. the --with-tools path)", () => {
    const out = formatSourceReceipts("See [from 2026-03-03-vpn-wireguard.md].", "/n", []);
    expect(out).toContain("from your note of 2026-03-03");
    expect(out).not.toContain('—'); // no snippet dash when there's no chunk
  });
});
