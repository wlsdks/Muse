import { describe, expect, it } from "vitest";

import { auditNoteGraph, buildNoteLinkGraph, extractWikiLinks, noteLinkKey, noteLinkView, resolveNoteId } from "./notes-links.js";

describe("extractWikiLinks", () => {
  it("pulls [[targets]], stripping |alias and #section, deduped order-preserving", () => {
    const body = "See [[Health Log]] and [[health log#sleep]] plus [[Project X|the project]]. Again [[Health Log]].";
    expect(extractWikiLinks(body)).toEqual(["Health Log", "Project X"]);
  });
  it("ignores empty targets and bodies with no links", () => {
    expect(extractWikiLinks("[[]] no real links here")).toEqual([]);
    expect(extractWikiLinks("plain note")).toEqual([]);
  });
});

describe("noteLinkKey", () => {
  it("is the basename without extension, lowercased", () => {
    expect(noteLinkKey("inbox/2026-05-01.md")).toBe("2026-05-01");
    expect(noteLinkKey("Health Log.markdown")).toBe("health log");
    expect(noteLinkKey("plain")).toBe("plain");
  });
});

describe("buildNoteLinkGraph + noteLinkView — backlinks", () => {
  const notes = [
    { id: "a.md", body: "links to [[b]] and [[c]]" },
    { id: "b.md", body: "links back to [[a]]" },
    { id: "c.md", body: "no links" }
  ];

  it("surfaces backlinks (who links to me) and resolves outbound targets", () => {
    const graph = buildNoteLinkGraph(notes);
    const viewC = noteLinkView(graph, "c.md");
    expect(viewC.backlinks).toEqual(["a.md"]); // a links to c
    expect(viewC.outbound).toEqual([]);

    const viewA = noteLinkView(graph, "a.md");
    expect(viewA.backlinks).toEqual(["b.md"]); // b links to a
    expect(viewA.outbound).toEqual([
      { resolvedId: "b.md", target: "b" },
      { resolvedId: "c.md", target: "c" }
    ]);
  });

  it("marks an outbound link to a non-existent note as unresolved", () => {
    const graph = buildNoteLinkGraph([{ id: "a.md", body: "see [[ghost]]" }]);
    expect(noteLinkView(graph, "a.md").outbound).toEqual([{ target: "ghost" }]);
  });

  it("resolveNoteId accepts an exact id or a name/stem", () => {
    const graph = buildNoteLinkGraph(notes);
    expect(resolveNoteId(graph, "a.md")).toBe("a.md");
    expect(resolveNoteId(graph, "A")).toBe("a.md"); // stem, case-insensitive
    expect(resolveNoteId(graph, "missing")).toBeUndefined();
  });
});

describe("auditNoteGraph — orphans + broken links (Zettelkasten hygiene)", () => {
  it("flags orphans (no links in or out) and broken links (unresolved targets)", () => {
    const graph = buildNoteLinkGraph([
      { id: "a.md", body: "links to [[b]] and [[ghost]]" }, // ghost is broken
      { id: "b.md", body: "links back to [[a]]" },
      { id: "lonely.md", body: "an island with no links" } // orphan
    ]);
    const audit = auditNoteGraph(graph);
    expect(audit.orphans).toEqual(["lonely.md"]);
    expect(audit.brokenLinks).toEqual([{ source: "a.md", target: "ghost" }]);
  });

  it("a fully-connected corpus has no orphans or broken links", () => {
    const graph = buildNoteLinkGraph([
      { id: "a.md", body: "[[b]]" },
      { id: "b.md", body: "[[a]]" }
    ]);
    expect(auditNoteGraph(graph)).toEqual({ brokenLinks: [], orphans: [] });
  });

  it("a note that is only linked TO (no outbound) is NOT an orphan", () => {
    const graph = buildNoteLinkGraph([
      { id: "hub.md", body: "[[leaf]]" },
      { id: "leaf.md", body: "no outbound links" }
    ]);
    expect(auditNoteGraph(graph).orphans).toEqual([]); // leaf has a backlink
  });
});
