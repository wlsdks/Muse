import { describe, expect, it } from "vitest";

import { classifyRetrievalConfidence, rankKnowledgeChunksWithHop } from "./knowledge-recall.js";
import { cosineSimilarity } from "./episodic-recall.js";

// Toy space: query hits A; A's text is close to B; B shares no signal with the query.
const VEC: Record<string, readonly number[]> = {
  "민서는 마케팅팀 팀장이다": [0.1, 1, 0],
  "사피엔스 추천해준 사람이 무슨 팀이야": [1, 0.05, 0],
  "사피엔스는 민서가 추천해준 책이다": [1, 0.3, 0],
  "오늘 회의에서 추천 도서 이야기를 했다": [0.85, 0.02, 0.1],
  "오늘 점심은 김치찌개": [0, 0, 1]
};
const embed = (text: string): Promise<readonly number[]> => Promise.resolve(VEC[text] ?? [0, 0, 0.01]);

const notes = [
  { source: "rec.md", text: "사피엔스는 민서가 추천해준 책이다" },
  { source: "minseo.md", text: "민서는 마케팅팀 팀장이다" },
  { source: "meeting.md", text: "오늘 회의에서 추천 도서 이야기를 했다" },
  { source: "lunch.md", text: "오늘 점심은 김치찌개" }
];

describe("rankKnowledgeChunksWithHop (deterministic pseudo-relevance second hop)", () => {
  it("surfaces the bridging note the raw query misses", async () => {
    const flat = await rankKnowledgeChunksWithHop("사피엔스 추천해준 사람이 무슨 팀이야", notes, { embed, hybrid: true, topK: 2 });
    expect(flat.map((m) => m.source)).toContain("rec.md");
    const hopped = await rankKnowledgeChunksWithHop("사피엔스 추천해준 사람이 무슨 팀이야", notes, { embed, hybrid: true, secondHop: true, topK: 3 });
    expect(hopped.map((m) => m.source)).toContain("rec.md");
    expect(hopped.map((m) => m.source)).toContain("minseo.md");
  });

  it("without secondHop behaves exactly like the base ranking", async () => {
    const base = await rankKnowledgeChunksWithHop("사피엔스 추천해준 사람이 무슨 팀이야", notes, { embed, hybrid: true, topK: 2 });
    expect(base.map((m) => m.source)).not.toContain("minseo.md");
  });
});

// ── confidence-inflation regression suite ──────────────────────────────────────
//
// Vector table (unit vectors in ℝ³):
//   query:  [1, 0, 0]
//   noteA:  [0.5, 0.866, 0]          cosine(query, A)  = 0.50  (below confident threshold 0.55)
//   noteA′: [0.4800, 0.8772, 0]      cosine(query, A′) ≈ 0.48; cosine(A, A′) ≈ 0.999
//   seed:   [0.5, 0.866, 0]          same vec as A (for clarity)
//
// With topK=1 only A lands in primary. The hop from A retrieves A′ (very close
// to A in embedding space) as a bridge. Before the fix A′'s appended cosine =
// cosine(A, A′) ≈ 0.999 → "confident". After the fix it is cosine(query, A′)
// ≈ 0.48 → "ambiguous".

const QUERY = "inflation query";
const NOTE_A_TEXT = "note alpha text";
const NOTE_A_PRIME_TEXT = "note alpha-prime text";
const NOTE_A_PRIME_EMBED_TEXT = "note alpha-prime EMBED text";

// Normalized unit vectors.
const A_VEC: readonly number[] = [0.5, 0.866, 0];
// A′ is a SIMILAR-but-distinct paraphrase of A: cosine(A,A′)≈0.970 — well above
// the confident threshold (the inflation this suite guards) yet BELOW the 0.985
// near-duplicate floor, so the engine-path dedup keeps it as a real bridge. The
// outright-duplicate (cosine≥0.985) drop is covered by its own dedup test below.
const A_PRIME_VEC: readonly number[] = [0.2756, 0.9613, 0];
// A different embedText vector — used to verify embedText is preferred over text.
const A_PRIME_EMBED_VEC: readonly number[] = [0.3, 0.954, 0];

const INFLATION_VEC: Record<string, readonly number[]> = {
  [QUERY]: [1, 0, 0],
  [NOTE_A_TEXT]: A_VEC,
  [NOTE_A_PRIME_TEXT]: A_PRIME_VEC,
  [NOTE_A_PRIME_EMBED_TEXT]: A_PRIME_EMBED_VEC,
};
const inflationEmbed = (text: string): Promise<readonly number[]> =>
  Promise.resolve(INFLATION_VEC[text] ?? [0, 0, 0]);

const inflationNotes = [
  { source: "A.md", text: NOTE_A_TEXT },
  { source: "Aprime.md", text: NOTE_A_PRIME_TEXT },
];

// minScore 0.49 keeps A (cosine≈0.50) in primary but excludes A′ (cosine≈0.48).
// In the hop from A, cosine(A, A′)≈0.999 > 0.49 so A′ surfaces as a hop-only bridge.
const inflationOpts = { embed: inflationEmbed, topK: 3, minScore: 0.49 };

describe("rankKnowledgeChunksWithHop — query-relative cosine on appended bridges", () => {
  it("appended bridge cosine equals cosine(embed(query), embed(bridgeText)), not cosine(seed, bridge)", async () => {
    const result = await rankKnowledgeChunksWithHop(QUERY, inflationNotes, { ...inflationOpts, secondHop: true });
    const bridge = result.find((m) => m.source === "Aprime.md");
    expect(bridge).toBeDefined();

    const queryVec = INFLATION_VEC[QUERY]!;
    const bridgeVec = INFLATION_VEC[NOTE_A_PRIME_TEXT]!;
    const expectedQueryCosine = cosineSimilarity(queryVec, bridgeVec);
    const seedCosine = cosineSimilarity(A_VEC, bridgeVec);

    // The bridge's cosine must be query-relative, not seed-relative.
    expect(bridge!.cosine).toBeCloseTo(expectedQueryCosine, 5);
    expect(bridge!.cosine).not.toBeCloseTo(seedCosine, 2);
  });

  it("confidence-inflation regression: appended bridge no longer flips weak retrieval to confident", async () => {
    // Pre-fix sanity: cosine(A, A′) is well above the confident threshold (0.55).
    const seedCosine = cosineSimilarity(A_VEC, A_PRIME_VEC);
    expect(seedCosine).toBeGreaterThan(0.55);

    // After fix: query-relative cosine of A′ is below the threshold.
    const queryVec = INFLATION_VEC[QUERY]!;
    const queryCosineAprime = cosineSimilarity(queryVec, A_PRIME_VEC);
    expect(queryCosineAprime).toBeLessThan(0.55);

    const result = await rankKnowledgeChunksWithHop(QUERY, inflationNotes, { ...inflationOpts, secondHop: true });
    // The result now has A (cosine ≈ 0.50) and A′ (cosine ≈ 0.48) — both below 0.55.
    const confidence = classifyRetrievalConfidence(result);
    expect(confidence).toBe("ambiguous");
  });

  it("bridge is still appended (ordering/joint-coverage unchanged)", async () => {
    const result = await rankKnowledgeChunksWithHop(QUERY, inflationNotes, { ...inflationOpts, secondHop: true });
    const sources = result.map((m) => m.source);
    expect(sources).toContain("A.md");
    expect(sources).toContain("Aprime.md");
    // Primary appears before the appended bridge.
    expect(sources.indexOf("A.md")).toBeLessThan(sources.indexOf("Aprime.md"));
  });

  it("primary list is deep-equal between secondHop:false and secondHop:true", async () => {
    const withoutHop = await rankKnowledgeChunksWithHop(QUERY, inflationNotes, { ...inflationOpts, secondHop: false });
    const withHop = await rankKnowledgeChunksWithHop(QUERY, inflationNotes, { ...inflationOpts, secondHop: true });

    // Primary entries (first `withoutHop.length` entries in the hopped result) are identical.
    const primarySlice = withHop.slice(0, withoutHop.length);
    expect(primarySlice).toEqual(withoutHop);
  });

  it("embedText preference: cosine is computed against the chunk's embedText vector, not its text vector", async () => {
    const notesWithEmbedText = [
      { source: "A.md", text: NOTE_A_TEXT },
      { source: "Aprime.md", text: NOTE_A_PRIME_TEXT, embedText: NOTE_A_PRIME_EMBED_TEXT },
    ];

    const result = await rankKnowledgeChunksWithHop(QUERY, notesWithEmbedText, {
      ...inflationOpts,
      embed: inflationEmbed,
      secondHop: true,
    });
    const bridge = result.find((m) => m.source === "Aprime.md");
    expect(bridge).toBeDefined();

    const queryVec = INFLATION_VEC[QUERY]!;
    const expectedFromEmbedText = cosineSimilarity(queryVec, A_PRIME_EMBED_VEC);
    const expectedFromText = cosineSimilarity(queryVec, A_PRIME_VEC);

    // The two expected cosines must differ (prove the test is meaningful).
    expect(Math.abs(expectedFromEmbedText - expectedFromText)).toBeGreaterThan(0.01);

    // The bridge should use the embedText vector.
    expect(bridge!.cosine).toBeCloseTo(expectedFromEmbedText, 5);
  });

  it("fail-safe: an embedder that throws during recompute keeps the bridge with cosine=0, does not reject", async () => {
    // Track ranking phase vs recompute phase: ranking fires 2-3 embed calls per chunk;
    // the recompute is triggered AFTER ranking completes and re-requests the query + bridge.
    // Simplest invariant: succeed during ranking (minScore needs A′ to be below threshold →
    // use the same inflationOpts corpus), then throw unconditionally for the QUERY embed
    // on the recompute pass (so queryVec is null → all bridges get cosine=0).
    let rankingDone = false;
    const flakyEmbed = (text: string): Promise<readonly number[]> => {
      if (rankingDone && text === QUERY) {
        return Promise.reject(new Error("embed failure on recompute query"));
      }
      const result = inflationEmbed(text);
      // Mark ranking done after the first QUERY embed (primary ranking issued it).
      // The hop ranking uses A.text as the query, so the second QUERY embed is the recompute.
      if (text === QUERY) rankingDone = true;
      return result;
    };

    const result = await rankKnowledgeChunksWithHop(
      QUERY, inflationNotes, { ...inflationOpts, embed: flakyEmbed, secondHop: true }
    );

    // The bridge is still present (hop ranking succeeded before the recompute).
    const bridge = result.find((m) => m.source === "Aprime.md");
    expect(bridge).toBeDefined();
    // Fail-safe: queryVec could not be obtained → cosine defaults to 0.
    expect(bridge!.cosine).toBe(0);
  });

  it("no-op: secondHop:false returns unchanged primary; empty corpus returns empty", async () => {
    const withoutHop = await rankKnowledgeChunksWithHop(QUERY, inflationNotes, inflationOpts);
    const withHopFalse = await rankKnowledgeChunksWithHop(QUERY, inflationNotes, { ...inflationOpts, secondHop: false });
    expect(withHopFalse).toEqual(withoutHop);

    const empty = await rankKnowledgeChunksWithHop(QUERY, [], { ...inflationOpts, secondHop: true });
    expect(empty).toEqual([]);
  });
});

// ── near-duplicate bridge dedup on the engine hop path ──────────────────────────
//
// Sibling-audit parity with the ask-window `dedupNearDuplicateChunks`
// (@muse/recall, agent-hardening fire 5): an appended hop/PPR bridge that is
// near-identical (cosine ≥ 0.985) to an already-kept chunk pads the small
// model's grounding window with redundancy. The hop re-queries with a primary's
// own text, so a paraphrase the ORIGINAL query missed (low query-cosine, below
// minScore) surfaces as a bridge even though it duplicates a primary.
//
// Vector space (unit vecs, angles from the x-axis = query direction):
//   query  [1, 0, 0]              0°
//   A      [0.5,    0.866,  0]   60°   query-cos 0.50 (≥minScore 0.49) → PRIMARY
//   Adup   [0.4695, 0.8829, 0]   62°   query-cos 0.47 (<minScore) → not primary;
//                                       cos(A,Adup)=0.9994 → hop bridge AND near-dup → DROPPED
//   B      [0.2588, 0.9659, 0]   75°   query-cos 0.26 (<minScore) → not primary;
//                                       cos(A,B)=0.966 (>minScore, <0.985) → distinct bridge → KEPT
const DEDUP_QUERY = "dedup query";
const DEDUP_VEC: Record<string, readonly number[]> = {
  [DEDUP_QUERY]: [1, 0, 0],
  "note A text": [0.5, 0.866, 0],
  "note A duplicate text": [0.4695, 0.8829, 0],
  "note B distinct text": [0.2588, 0.9659, 0],
};
const dedupEmbed = (text: string): Promise<readonly number[]> =>
  Promise.resolve(DEDUP_VEC[text] ?? [0, 0, 0]);
const dedupNotes = [
  { source: "A.md", text: "note A text" },
  { source: "Adup.md", text: "note A duplicate text" },
  { source: "B.md", text: "note B distinct text" },
];
const dedupOpts = { embed: dedupEmbed, topK: 3, minScore: 0.49 };

describe("rankKnowledgeChunksWithHop — near-duplicate bridge dedup (engine-path parity)", () => {
  it("drops a hop bridge that is a near-duplicate (cosine≥0.985) of a primary, keeps a distinct one", async () => {
    const result = await rankKnowledgeChunksWithHop(DEDUP_QUERY, dedupNotes, { ...dedupOpts, secondHop: true });
    const sources = result.map((m) => m.source);
    expect(sources).toContain("A.md");          // primary hit survives
    expect(sources).not.toContain("Adup.md");   // near-identical paraphrase → redundant → dropped
    expect(sources).toContain("B.md");          // distinct bridge → multi-hop coverage kept
  });

  it("AUGMENT-never-displace: the primary prefix is byte-identical with vs without the hop", async () => {
    const withoutHop = await rankKnowledgeChunksWithHop(DEDUP_QUERY, dedupNotes, dedupOpts);
    const withHop = await rankKnowledgeChunksWithHop(DEDUP_QUERY, dedupNotes, { ...dedupOpts, secondHop: true });
    expect(withHop.slice(0, withoutHop.length)).toEqual(withoutHop);
  });

  it("FAIL-OPEN: an embed failure during the dedup pass keeps the bridge (never wrongly dropped)", async () => {
    // The duplicate's chunk embeds fine during ranking (so it surfaces as a hop
    // bridge) but THROWS on the later dedup re-embed → embedFor returns null →
    // the dedup cannot confirm a near-duplicate and KEEPS it. Fail-open: a
    // bridge is dropped only on a CONFIRMED match, never on an embed error.
    let dupEmbedCalls = 0;
    const flakyEmbed = (text: string): Promise<readonly number[]> => {
      if (text === "note A duplicate text") {
        dupEmbedCalls += 1;
        // Ranking + the query-cosine recompute embed this text first (each with
        // its own fail-safe); the FINAL call is the dedup re-embed — throw there.
        if (dupEmbedCalls >= 4) return Promise.reject(new Error("dedup re-embed failed"));
      }
      return dedupEmbed(text);
    };
    const result = await rankKnowledgeChunksWithHop(DEDUP_QUERY, dedupNotes, {
      ...dedupOpts,
      embed: flakyEmbed,
      secondHop: true,
    });
    expect(result.map((m) => m.source)).toContain("Adup.md");
  });
});
