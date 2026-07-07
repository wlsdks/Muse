import { describe, expect, it } from "vitest";

import { enforceAnswerCitations } from "@muse/agent-core";
import { buildBrowsingContextBlock, selectBrowsingVisitsForQuery, type BrowsingVisit } from "@muse/recall";

// The stage-2 ask integration end-to-end at the pure seams commands-ask threads:
// a seeded browsing store → ask retrieval SELECTS the relevant visit → its host is
// the citation the gate ALLOWS → a fabricated browsing citation is STRIPPED. Mirrors
// commands-ask-feeds.test.ts (which unit-tests the feed selection primitive), plus
// the citation-gate seam the browsing surface adds.
const seededVisits: readonly BrowsingVisit[] = [
  // A Korean-titled visit so a Korean query grounds end-to-end (lexical overlap is
  // script-aware, not embedding-based — same as feeds; a KO query matches KO text).
  { id: "1", title: "러스트 소유권 정리 블로그", url: "https://blog.rust-lang.org/ownership", visitedAt: "2026-06-20T00:00:00.000Z" },
  { id: "2", title: "Weeknight pasta recipe", url: "https://cooking.example.com/pasta", visitedAt: "2026-06-25T00:00:00.000Z" }
];

describe("muse ask — browsing-history grounding integration (retrieval → citation-allowed → gate)", () => {
  it("selects the relevant visit for a Korean query and offers its host as the allowed citation", () => {
    const hits = selectBrowsingVisitsForQuery(seededVisits, "지난주에 본 그 러스트 블로그", 6);
    expect(hits.map((h) => h.host)).toEqual(["blog.rust-lang.org"]);
    // The block the model is shown carries the [browsing: host] marker it must copy.
    expect(buildBrowsingContextBlock(hits)).toContain("[browsing: blog.rust-lang.org]");
  });

  it("keeps a citation to a really-visited site and STRIPS a fabricated one (the fabrication gate)", () => {
    const hits = selectBrowsingVisitsForQuery(seededVisits, "러스트 소유권", 6);
    const citationAllowed = { browsing: hits.map((h) => h.host) };
    const answer =
      "You read a Rust ownership guide [browsing: blog.rust-lang.org], and something on a bank site [browsing: totally-made-up.example].";
    const gated = enforceAnswerCitations(answer, citationAllowed);
    expect(gated.text).toContain("[browsing: blog.rust-lang.org]");
    expect(gated.text).not.toContain("totally-made-up.example");
    expect(gated.stripped).toEqual(["totally-made-up.example"]);
  });
});
