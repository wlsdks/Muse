import { describe, expect, it } from "vitest";
import {
  Bm25Scorer,
  DefaultRagPipeline,
  InMemoryRagCorpus,
  PassthroughQueryTransformer,
  SimpleContextBuilder,
  SimpleReranker,
  StructuredContextBuilder,
  TokenBasedDocumentChunker,
  chunkId,
  emptyRagContext,
  rrfFuse,
  tokenize
} from "../src/index.js";

describe("TokenBasedDocumentChunker", () => {
  it("splits long documents with parent metadata", () => {
    const chunker = new TokenBasedDocumentChunker({
      chunkSize: 8,
      minChunkSizeChars: 8,
      minChunkThreshold: 4,
      overlap: 1
    });
    const chunks = chunker.chunk({
      content: "First paragraph has context.\n\nSecond paragraph has more context.\n\nThird paragraph ends.",
      id: "doc-1",
      metadata: { scope: "test" },
      source: "synthetic"
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({
      id: chunkId("doc-1", 0),
      metadata: { chunk_index: 0, chunked: true, parent_document_id: "doc-1" },
      source: "synthetic"
    });
  });
});

describe("Bm25Scorer", () => {
  it("scores and filters indexed documents", () => {
    const scorer = new Bm25Scorer();

    scorer.index("doc-1", "alpha beta beta", { workspaceId: "workspace-1" });
    scorer.index("doc-2", "gamma delta", { workspaceId: "workspace-2" });

    expect(scorer.score("beta", "doc-1")).toBeGreaterThan(0);
    expect(scorer.search("beta", 10, { workspaceId: "workspace-1" }).map(([id]) => id)).toEqual(["doc-1"]);
    expect(scorer.search("beta", 10, { workspaceId: "workspace-2" })).toEqual([]);
  });

  it("supports Korean partial matching tokens", () => {
    expect(tokenize("플랫폼팀은 문서를 관리한다")).toContain("플랫폼팀");
  });
});

describe("RRF and reranking", () => {
  it("fuses rankings without depending on raw score scale", () => {
    const fused = rrfFuse(
      [["a", 100], ["b", 90]],
      [["b", 1], ["c", 0.5]],
      { bm25Weight: 0.5, vectorWeight: 0.5 }
    );

    expect(fused[0]?.[0]).toBe("b");
  });

  it("reranks by lexical overlap while preserving original score", () => {
    const reranked = new SimpleReranker().rerank(
      "alpha",
      [
        { content: "nothing", estimatedTokens: 1, id: "low", metadata: {}, score: 10 },
        { content: "alpha alpha", estimatedTokens: 1, id: "match", metadata: {}, score: 0.1 }
      ],
      2
    );

    expect(reranked[0]?.id).toBe("low");
    expect(reranked[1]?.score).toBeGreaterThan(0.1);
  });
});

describe("context builders", () => {
  it("builds simple and structured context within a token budget", () => {
    const documents = [
      { content: "alpha", estimatedTokens: 1, id: "doc-1", metadata: {}, score: 1, source: "one" },
      { content: "beta", estimatedTokens: 10, id: "doc-2", metadata: {}, score: 1 }
    ];

    expect(new SimpleContextBuilder().build(documents, 1)).toContain("Source: one");
    expect(JSON.parse(new StructuredContextBuilder().build(documents, 1)).documents).toHaveLength(1);
  });
});

describe("DefaultRagPipeline", () => {
  it("retrieves, reranks, and builds context from an in-memory corpus", async () => {
    const corpus = new InMemoryRagCorpus();
    corpus.add({
      content: "Muse supports scheduler, cache, and RAG modules.",
      id: "doc-1",
      metadata: { workspaceId: "workspace-1" },
      source: "architecture"
    });
    corpus.add({
      content: "A different workspace has unrelated notes.",
      id: "doc-2",
      metadata: { workspaceId: "workspace-2" }
    });
    const pipeline = new DefaultRagPipeline({
      contextBuilder: new SimpleContextBuilder(),
      queryTransformer: new PassthroughQueryTransformer(),
      reranker: new SimpleReranker(),
      retriever: corpus
    });

    const context = await pipeline.retrieve({
      filters: { workspaceId: "workspace-1" },
      query: "scheduler RAG",
      topK: 3
    });

    expect(context.documents.map((document) => document.id)).toEqual(["doc-1"]);
    expect(context.context).toContain("Muse supports scheduler");
    expect(context.totalTokens).toBeGreaterThan(0);
  });

  it("returns an empty context when no documents match", async () => {
    const pipeline = new DefaultRagPipeline({ retriever: new InMemoryRagCorpus() });

    await expect(pipeline.retrieve({ query: "missing" })).resolves.toEqual(emptyRagContext);
  });
});
