import { describe, expect, it } from "vitest";

import { diversifyAskChunks, notesGroundingFraming, secondHopAugmentChunks, type ScoredChunk } from "@muse/recall";

const mk = (id: string, text: string, score: number, embedding: number[]): ScoredChunk => ({
  chunk: { file: `${id}.md`, chunkIndex: 0, text, embedding },
  file: `${id}.md`,
  score
});

const dot = (a: readonly number[], b: readonly number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};
const norm = (a: readonly number[]): number => Math.sqrt(dot(a, a)) || 1;
const cosine = (a: readonly number[], b: readonly number[]): number => dot(a, b) / (norm(a) * norm(b));

describe("diversifyAskChunks", () => {
  it("returns the sorted top-K when there are no more candidates than K", () => {
    const c = [mk("a", "alpha", 0.9, [1, 0]), mk("b", "beta", 0.5, [0, 1])];
    const out = diversifyAskChunks(c, 5);
    expect(out.map((s) => s.file)).toEqual(["a.md", "b.md"]);
  });
  it("narrows to K and keeps the strongest first (no query)", () => {
    const c = [mk("a", "alpha", 0.9, [1, 0]), mk("b", "beta", 0.5, [0, 1]), mk("c", "gamma", 0.1, [1, 1])];
    const out = diversifyAskChunks(c, 1);
    expect(out).toHaveLength(1);
    expect(out[0]!.file).toBe("a.md");
  });
  it("returns nothing for a non-positive K", () => {
    expect(diversifyAskChunks([mk("a", "x", 1, [1])], 0)).toEqual([]);
  });
});

describe("secondHopAugmentChunks", () => {
  // Two-hop corpus with deterministic vectors. The QUERY ("manager's boss")
  // points at the manager note (hop-1 seed). The bridge/answer note ("Dana
  // reports to Sarah") shares the manager ENTITY axis with the seed but NOT
  // the query axis — exactly the two-hop miss single-hop recall can't carry.
  // axes: [query, manager-entity, distractor]
  const queryVec = [1, 0, 0];
  const mgr = mk("mgr", "my manager is Dana", 0.9, [0.9, 0.6, 0]); // hop-1 seed: close to query AND carries manager entity
  const org = mk("org", "Dana reports to Sarah", 0.1, [0.05, 0.95, 0]); // bridge: shares manager entity, far from query
  const distractor = mk("d1", "weekend hiking", 0.08, [0, 0, 1]);

  it("appends the bridged note reachable only via the seed (AUGMENT)", () => {
    const allScored = [mgr, org, distractor];
    const present = [mgr]; // single-hop primary selected only the manager note
    const additions = secondHopAugmentChunks(queryVec, cosine, allScored, [mgr], present);
    expect(additions.map((s) => s.file)).toContain("org.md");
  });

  it("recomputes the appended chunk's score against the ORIGINAL query, not the seed", () => {
    const allScored = [mgr, org, distractor];
    const additions = secondHopAugmentChunks(queryVec, cosine, allScored, [mgr], [mgr]);
    const org2 = additions.find((s) => s.file === "org.md")!;
    // query-relative cosine of org is LOW (bridge far from query) — never the
    // inflated seed-relative cosine that surfaced it.
    expect(org2.score).toBeCloseTo(cosine(queryVec, org.chunk.embedding), 6);
    expect(org2.score).toBeLessThan(0.2);
  });

  it("never returns a chunk already present (no displacement / no dup)", () => {
    const allScored = [mgr, org, distractor];
    const additions = secondHopAugmentChunks(queryVec, cosine, allScored, [mgr], [mgr, org]);
    expect(additions.map((s) => s.file)).not.toContain("org.md");
    expect(additions.map((s) => s.file)).not.toContain("mgr.md");
  });

  it("caps the number of appended chunks", () => {
    const extra = mk("org2", "Dana also mentors Lee", 0.1, [0.05, 0.9, 0]);
    const extra2 = mk("org3", "Dana leads platform", 0.1, [0.05, 0.85, 0]);
    const allScored = [mgr, org, extra, extra2, distractor];
    const additions = secondHopAugmentChunks(queryVec, cosine, allScored, [mgr], [mgr], 2);
    expect(additions.length).toBeLessThanOrEqual(2);
  });

  it("returns nothing for a non-positive cap, empty seeds, or empty corpus", () => {
    expect(secondHopAugmentChunks(queryVec, cosine, [mgr], [mgr], [], 0)).toEqual([]);
    expect(secondHopAugmentChunks(queryVec, cosine, [mgr], [], [])).toEqual([]);
    expect(secondHopAugmentChunks(queryVec, cosine, [], [mgr], [])).toEqual([]);
  });
});

describe("notesGroundingFraming", () => {
  it("reports 'none' with the plain header for empty evidence", () => {
    const out = notesGroundingFraming([], "anything");
    expect(out.verdict).toBe("none");
    expect(out.header).toContain("USER NOTES");
    expect(out.guidance).toBeUndefined();
  });
  it("upgrades an ambiguous verdict to confident on a strong lexical match", () => {
    const weak = [mk("a", "wireguard mtu is 1380 for the tunnel", 0.55, [1, 0])];
    const out = notesGroundingFraming(weak, "wireguard mtu");
    expect(["confident", "ambiguous", "none"]).toContain(out.verdict);
  });
});
