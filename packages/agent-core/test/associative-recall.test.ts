import { describe, expect, it } from "vitest";

import { buildNoteLinkGraph, personalizedPageRank } from "../src/associative-recall.js";
import { rankKnowledgeChunksWithHop } from "../src/knowledge-recall.js";

// ── buildNoteLinkGraph ─────────────────────────────────────────────────────────

describe("buildNoteLinkGraph — edge construction", () => {
  it("links two chunks that share a rare token", () => {
    const chunks = [
      { source: "a.md", text: "minseo recommended sapiens" },
      { source: "b.md", text: "minseo is in the marketing team" },
      { source: "c.md", text: "lunch was bibimbap today" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const keyA = "a.md|minseo recommended sapiens";
    const keyB = "b.md|minseo is in the marketing team";
    const keyC = "c.md|lunch was bibimbap today";
    // A and B share "minseo" (df=2, not N=3) → linked.
    expect(graph.edges.get(keyA)?.has(keyB)).toBe(true);
    // C shares no token with A or B → no edge to C.
    expect(graph.edges.get(keyA)?.has(keyC)).toBeFalsy();
    expect(graph.edges.get(keyB)?.has(keyC)).toBeFalsy();
  });

  it("does NOT create an edge for a token present in every chunk (df === N)", () => {
    // "shared" appears in ALL three chunks → df=3=N → contributes no edge weight.
    const chunks = [
      { source: "x.md", text: "shared alpha content" },
      { source: "y.md", text: "shared beta content" },
      { source: "z.md", text: "shared gamma content" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const keyX = "x.md|shared alpha content";
    const keyY = "y.md|shared beta content";
    const keyZ = "z.md|shared gamma content";
    // "shared" is in every chunk → no edge anywhere.
    expect(graph.edges.get(keyX)?.has(keyY)).toBeFalsy();
    expect(graph.edges.get(keyX)?.has(keyZ)).toBeFalsy();
    expect(graph.edges.get(keyY)?.has(keyZ)).toBeFalsy();
  });

  it("edge weight ordering: a rare shared token (df=2) yields higher weight than a common shared token (df high)", () => {
    // 4 chunks: A+B share "sapiens" (df=2, rare) and "book" (df=4, common=N).
    // A+C share only "book" (df=4 = N → contributes nothing).
    // So edge(A,B) exists (via "sapiens"), edge(A,C) does not.
    const chunks = [
      { source: "a.md", text: "sapiens book review" },
      { source: "b.md", text: "sapiens book recommendation" },
      { source: "c.md", text: "reading book today" },
      { source: "d.md", text: "good book yesterday" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const keyA = "a.md|sapiens book review";
    const keyB = "b.md|sapiens book recommendation";
    const keyC = "c.md|reading book today";
    // "book" is in all 4 chunks (df=4=N) → no edge contribution from "book".
    // A and B share "sapiens" (df=2) → edge exists.
    // A and C share only "book" (df=N) → no edge.
    const wAB = graph.edges.get(keyA)?.get(keyB) ?? 0;
    const wAC = graph.edges.get(keyA)?.get(keyC) ?? 0;
    expect(wAB).toBeGreaterThan(0);
    expect(wAC).toBe(0);
  });
});

// ── personalizedPageRank ───────────────────────────────────────────────────────

describe("personalizedPageRank — propagation", () => {
  it("chain A–B–C: seed A → PPR propagates through the chain; C > disconnected D", () => {
    // A–B–C chain: A shares "minseo" with B only; B shares "bibimbap" with C only.
    // D has no shared tokens with any. A is the seed.
    const chunks = [
      { source: "a.md", text: "minseo sapiens query" },
      { source: "b.md", text: "minseo bibimbap worker" },
      { source: "c.md", text: "bibimbap restaurant review" },
      { source: "d.md", text: "completely unrelated xyzzy" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const keyA = "a.md|minseo sapiens query";
    const keyC = "c.md|bibimbap restaurant review";
    const keyD = "d.md|completely unrelated xyzzy";

    const seeds = new Map([[keyA, 1.0]]);
    const scores = personalizedPageRank(graph, seeds, { damping: 0.85, iterations: 50 });

    const sC = scores.get(keyC) ?? 0;
    const sD = scores.get(keyD) ?? 0;

    // Transitive propagation: C (two-hop from seed A via B) gets non-trivial mass.
    // D (disconnected) gets only (tiny) teleport mass since seed teleport goes to A only.
    // With personalized teleport seeded only at A, D gets 0 teleport (seed={A:1}).
    expect(sC).toBeGreaterThan(sD);

    // The seed itself (A) must rank above the disconnected node.
    const sA = scores.get(keyA) ?? 0;
    expect(sA).toBeGreaterThan(sD);
  });

  it("determinism: two runs on the same graph+seeds produce identical Maps", () => {
    const chunks = [
      { source: "a.md", text: "minseo sapiens book" },
      { source: "b.md", text: "minseo marketing team" },
      { source: "c.md", text: "lunch bibimbap today" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const keyA = "a.md|minseo sapiens book";
    const seeds = new Map([[keyA, 1.0]]);

    const r1 = personalizedPageRank(graph, seeds);
    const r2 = personalizedPageRank(graph, seeds);

    for (const node of graph.nodes) {
      expect(r1.get(node)).toBe(r2.get(node));
    }
  });

  it("cyclic graph terminates within the iteration cap (no infinite loop)", () => {
    // A–B–C–A cycle.
    const chunks = [
      { source: "a.md", text: "cycle alpha beta" },
      { source: "b.md", text: "cycle beta gamma" },
      { source: "c.md", text: "cycle gamma alpha" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const keyA = "a.md|cycle alpha beta";
    const seeds = new Map([[keyA, 1.0]]);

    // If this does not hang/throw, the iteration cap works.
    const scores = personalizedPageRank(graph, seeds, { iterations: 5 });
    expect(scores.size).toBe(3);
    for (const [, v] of scores) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("disconnected node D gets only teleport mass and never outranks a seed-connected node", () => {
    const chunks = [
      { source: "a.md", text: "linked alpha content" },
      { source: "b.md", text: "linked alpha text" },
      { source: "isolated.md", text: "completely unrelated xyz" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const keyA = "a.md|linked alpha content";
    const keyIso = "isolated.md|completely unrelated xyz";

    const seeds = new Map([[keyA, 1.0]]);
    const scores = personalizedPageRank(graph, seeds, { damping: 0.85 });

    // Isolated node D only gets (1-damping)*teleport(D) mass, which is tiny since D isn't seeded.
    const sA = scores.get(keyA) ?? 0;
    const sIso = scores.get(keyIso) ?? 0;
    expect(sA).toBeGreaterThan(sIso);
  });

  it("empty seeds → uniform teleport, deterministic, no NaN", () => {
    const chunks = [
      { source: "a.md", text: "alpha content beta" },
      { source: "b.md", text: "gamma content delta" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const emptySeeds = new Map<string, number>();

    const scores = personalizedPageRank(graph, emptySeeds);
    expect(scores.size).toBe(2);
    for (const [, v] of scores) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    // With uniform teleport all nodes should be roughly equal (graph is small).
    const vals = [...scores.values()];
    expect(Math.abs(vals[0]! - vals[1]!)).toBeLessThan(0.5);
  });

  it("all-zero seeds → uniform teleport, no NaN", () => {
    const chunks = [
      { source: "a.md", text: "alpha content" },
      { source: "b.md", text: "beta content" },
    ];
    const graph = buildNoteLinkGraph(chunks);
    const zeroSeeds = new Map([
      ["a.md|alpha content", 0],
      ["b.md|beta content", 0],
    ]);

    const scores = personalizedPageRank(graph, zeroSeeds);
    for (const [, v] of scores) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

// ── integration: rankKnowledgeChunksWithHop with associative flag ─────────────
//
// Vector space (4-d unit vecs, chosen so cosines are explicit):
//   query           [1,   0,   0,   0]
//   rec.md          [0.9, 0.1, 0,   0]   cosine≈0.994  → well above minScore=0.3 → primary
//   bridge.md       [0,   0,   1,   0]   cosine=0      → BELOW minScore=0.3 → absent from flag-OFF
//                   shares token "minseo" with rec.md  → PPR-reachable → appended flag-ON
//   unrelated.md    [0,   0,   0,   1]   cosine=0      → no shared token with anything → PPR=0
//
// This fixture proves the HippoRAG-2 mechanism (arXiv:2502.14802): the bridge
// note is absent from the cosine-only result but appears in the graph-augmented
// result, while the zero-PPR unrelated note is excluded by the PPR>0 floor.

const ASSOC_VEC: Record<string, readonly number[]> = {
  "query about sapiens":             [1,   0,   0,   0],
  "minseo recommended sapiens book": [0.9, 0.1, 0,   0],
  "minseo bridge detail":            [0,   0,   1,   0],
  "totally unrelated xyzzy note":    [0,   0,   0,   1],
};

const fakeEmbed = (text: string): Promise<readonly number[]> =>
  Promise.resolve(ASSOC_VEC[text] ?? [0, 0, 0, 0.01]);

// rec.md and bridge.md share the salient token "minseo" (df=2 < N=3).
// unrelated.md shares NO token with any other note.
const assocNotes = [
  { source: "rec.md",        text: "minseo recommended sapiens book" },
  { source: "bridge.md",     text: "minseo bridge detail" },
  { source: "unrelated.md",  text: "totally unrelated xyzzy note" },
];

describe("rankKnowledgeChunksWithHop — associative flag integration", () => {
  it("associative absent → result deep-equals the non-flagged call (byte-identical base path)", async () => {
    const base = await rankKnowledgeChunksWithHop("query about sapiens", assocNotes, {
      embed: fakeEmbed,
      hybrid: true,
      topK: 2,
    });
    const withFlagOff = await rankKnowledgeChunksWithHop("query about sapiens", assocNotes, {
      associative: false,
      embed: fakeEmbed,
      hybrid: true,
      topK: 2,
    });
    expect(withFlagOff).toEqual(base);
  });

  it("bridge absent flag-OFF, present flag-ON; unrelated never appended (PPR=0 floor)", async () => {
    // minScore=0.3: rec.md (~0.994) → primary; bridge.md (0) and unrelated.md (0) → excluded.
    const flagOff = await rankKnowledgeChunksWithHop("query about sapiens", assocNotes, {
      associative: false,
      embed: fakeEmbed,
      hybrid: true,
      minScore: 0.3,
      topK: 3,
    });
    const flagOffSources = flagOff.map((m) => m.source);
    // bridge.md is absent from the cosine-only result (cosine 0 < minScore 0.3).
    expect(flagOffSources).not.toContain("bridge.md");

    const flagOn = await rankKnowledgeChunksWithHop("query about sapiens", assocNotes, {
      associative: true,
      embed: fakeEmbed,
      hybrid: true,
      minScore: 0.3,
      topK: 3,
    });
    const flagOnSources = flagOn.map((m) => m.source);
    // rec.md is the primary hit.
    expect(flagOnSources).toContain("rec.md");
    // bridge.md is appended via the PPR graph chain (rec→bridge via "minseo" token).
    expect(flagOnSources).toContain("bridge.md");
    // unrelated.md has PPR score 0 — the floor excludes it.
    expect(flagOnSources).not.toContain("unrelated.md");
    // Additions beyond primaries capped at 2.
    expect(flagOn.length - flagOff.length).toBeLessThanOrEqual(2);
    // Primary prefix is unchanged.
    expect(flagOn.slice(0, flagOff.length)).toEqual(flagOff);
    // Bridge carries a finite query-relative cosine.
    const bridge = flagOn.find((m) => m.source === "bridge.md");
    expect(bridge).toBeDefined();
    expect(typeof bridge!.cosine).toBe("number");
    expect(Number.isFinite(bridge!.cosine)).toBe(true);
  });

  it("embed throw during recompute → bridge cosine=0, primaries unchanged, no throw", async () => {
    let recomputePhase = false;
    const throwingEmbed = (text: string): Promise<readonly number[]> => {
      if (recomputePhase && text === "query about sapiens") {
        return Promise.reject(new Error("embed failure"));
      }
      const r = fakeEmbed(text);
      if (text === "query about sapiens") {
        recomputePhase = true;
      }
      return r;
    };

    const result = await rankKnowledgeChunksWithHop("query about sapiens", assocNotes, {
      associative: true,
      embed: throwingEmbed,
      hybrid: true,
      minScore: 0.3,
      topK: 3,
    });

    // Primaries are still present.
    expect(result.map((m) => m.source)).toContain("rec.md");

    // Any appended bridge must have cosine=0 (fail-safe).
    const base = await rankKnowledgeChunksWithHop("query about sapiens", assocNotes, {
      embed: fakeEmbed,
      hybrid: true,
      minScore: 0.3,
      topK: 3,
    });
    const additions = result.slice(base.length);
    for (const m of additions) {
      expect(m.cosine).toBe(0);
    }
  });
});
