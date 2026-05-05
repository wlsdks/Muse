import { createApproximateTokenEstimator, type TokenEstimator } from "@muse/memory";
import { createRunId, type JsonObject, type JsonValue } from "@muse/shared";

export type Awaitable<T> = T | Promise<T>;

export interface RagDocument {
  readonly id: string;
  readonly content: string;
  readonly metadata: JsonObject;
  readonly source?: string;
}

export interface RetrievedDocument extends RagDocument {
  readonly score: number;
  readonly estimatedTokens: number;
}

export interface RagQuery {
  readonly query: string;
  readonly topK?: number;
  readonly filters?: JsonObject;
  readonly rerank?: boolean;
}

export interface RagContext {
  readonly context: string;
  readonly documents: readonly RetrievedDocument[];
  readonly totalTokens: number;
}

export interface DocumentChunker {
  chunk(document: RagDocument): readonly RagDocument[];
}

export interface DocumentRetriever {
  retrieve(queries: readonly string[], topK: number, filters?: JsonObject): Awaitable<readonly RetrievedDocument[]>;
}

export interface DocumentReranker {
  rerank(query: string, documents: readonly RetrievedDocument[], topK: number): Awaitable<readonly RetrievedDocument[]>;
}

export interface QueryTransformer {
  transform(query: string): Awaitable<readonly string[]>;
}

export interface ContextCompressor {
  compress(query: string, documents: readonly RetrievedDocument[]): Awaitable<readonly RetrievedDocument[]>;
}

export interface ContextBuilder {
  build(documents: readonly RetrievedDocument[], maxTokens: number): string;
}

export interface RagPipeline {
  retrieve(query: RagQuery): Promise<RagContext>;
}

export interface TokenBasedDocumentChunkerOptions {
  readonly chunkSize?: number;
  readonly minChunkSizeChars?: number;
  readonly minChunkThreshold?: number;
  readonly overlap?: number;
  readonly keepSeparator?: boolean;
  readonly maxNumChunks?: number;
  readonly tokenEstimator?: TokenEstimator;
}

export interface DefaultRagPipelineOptions {
  readonly queryTransformer?: QueryTransformer;
  readonly retriever: DocumentRetriever;
  readonly reranker?: DocumentReranker;
  readonly contextCompressor?: ContextCompressor;
  readonly contextBuilder?: ContextBuilder;
  readonly maxContextTokens?: number;
  readonly tokenEstimator?: TokenEstimator;
}

export interface InMemoryRagCorpusOptions {
  readonly chunker?: DocumentChunker;
  readonly tokenEstimator?: TokenEstimator;
}

export const emptyRagContext: RagContext = {
  context: "",
  documents: [],
  totalTokens: 0
};

const defaultTopK = 5;
const defaultMaxContextTokens = 4_000;
const defaultChunkSize = 512;
const defaultMinChunkSizeChars = 350;
const defaultMinChunkThreshold = 512;
const defaultOverlap = 50;
const defaultMaxNumChunks = 100;
const minTokenLength = 2;
const maxKoreanNgramLength = 4;

export class TokenBasedDocumentChunker implements DocumentChunker {
  private readonly chunkSize: number;
  private readonly minChunkSizeChars: number;
  private readonly minChunkThreshold: number;
  private readonly overlap: number;
  private readonly keepSeparator: boolean;
  private readonly maxNumChunks: number;
  private readonly tokenEstimator: TokenEstimator;

  constructor(options: TokenBasedDocumentChunkerOptions = {}) {
    this.chunkSize = Math.max(1, options.chunkSize ?? defaultChunkSize);
    this.minChunkSizeChars = Math.max(1, options.minChunkSizeChars ?? defaultMinChunkSizeChars);
    this.minChunkThreshold = Math.max(1, options.minChunkThreshold ?? defaultMinChunkThreshold);
    this.overlap = Math.max(0, options.overlap ?? defaultOverlap);
    this.keepSeparator = options.keepSeparator ?? true;
    this.maxNumChunks = Math.max(1, options.maxNumChunks ?? defaultMaxNumChunks);
    this.tokenEstimator = options.tokenEstimator ?? createApproximateTokenEstimator();
  }

  chunk(document: RagDocument): readonly RagDocument[] {
    const content = document.content;

    if (content.trim().length === 0) {
      return [document];
    }

    const estimatedTokens = this.tokenEstimator.estimate(content);

    if (estimatedTokens <= this.minChunkThreshold) {
      return [document];
    }

    const charsPerToken = content.length / estimatedTokens;
    const targetChars = Math.max(1, Math.floor(this.chunkSize * charsPerToken));
    const overlapChars = Math.max(0, Math.floor(this.overlap * charsPerToken));
    const chunks = this.splitRecursive(content, targetChars, overlapChars);

    if (chunks.length <= 1) {
      return [document];
    }

    return chunks.map((chunk, index) => ({
      content: chunk,
      id: chunkId(document.id, index),
      metadata: {
        ...document.metadata,
        chunk_index: index,
        chunk_total: chunks.length,
        chunked: true,
        parent_document_id: document.id
      },
      source: document.source
    }));
  }

  private splitRecursive(text: string, targetSize: number, overlapSize: number): readonly string[] {
    if (text.length <= targetSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length && chunks.length < this.maxNumChunks) {
      let end = Math.min(start + targetSize, text.length);

      if (end < text.length) {
        end = this.findBreakPoint(text, start, end);
      }

      const chunk = text.slice(start, end).trim();

      if (chunk.length >= this.minChunkSizeChars || chunks.length === 0) {
        chunks.push(chunk);
      } else if (chunks.length > 0) {
        const previous = chunks.pop() ?? "";
        chunks.push(`${previous}\n${chunk}`);
      }

      const nextStart = end - overlapSize;
      start = nextStart <= start ? end : nextStart;
    }

    return chunks;
  }

  private findBreakPoint(text: string, start: number, end: number): number {
    const searchFrom = start + Math.floor((end - start) / 2);
    const paragraphBreak = text.lastIndexOf("\n\n", end);

    if (paragraphBreak > searchFrom) {
      return this.keepSeparator ? paragraphBreak : paragraphBreak + 2;
    }

    const lineBreak = text.lastIndexOf("\n", end);

    if (lineBreak > searchFrom) {
      return this.keepSeparator ? lineBreak : lineBreak + 1;
    }

    for (let index = end; index >= searchFrom; index -= 1) {
      const current = text[index];
      const next = text[index + 1];

      if (current && sentenceEnds.has(current) && (!next || /\s/u.test(next))) {
        return index + 1;
      }
    }

    const spaceBreak = text.lastIndexOf(" ", end);
    return spaceBreak > searchFrom ? spaceBreak + 1 : end;
  }
}

export class Bm25Scorer {
  private readonly docContents = new Map<string, string>();
  private readonly docMetadata = new Map<string, JsonObject>();
  private readonly termFrequencies = new Map<string, Map<string, number>>();
  private readonly documentLengths = new Map<string, number>();
  private readonly documentFrequency = new Map<string, number>();
  private idfCache = new Map<string, number>();
  private totalLength = 0;

  constructor(
    private readonly k1 = 1.5,
    private readonly b = 0.75
  ) {}

  index(docId: string, content: string, metadata: JsonObject = {}): void {
    const tokens = tokenize(content);
    const termFrequency = countTerms(tokens);
    const existing = this.termFrequencies.get(docId);

    if (existing) {
      this.totalLength -= sum([...existing.values()]);

      for (const token of existing.keys()) {
        const count = this.documentFrequency.get(token) ?? 1;
        count <= 1 ? this.documentFrequency.delete(token) : this.documentFrequency.set(token, count - 1);
      }
    }

    this.docContents.set(docId, content);
    this.docMetadata.set(docId, metadata);
    this.termFrequencies.set(docId, termFrequency);
    this.documentLengths.set(docId, tokens.length);
    this.totalLength += tokens.length;

    for (const token of termFrequency.keys()) {
      this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
    }

    this.idfCache = new Map();
  }

  score(query: string, docId: string): number {
    const termFrequency = this.termFrequencies.get(docId);

    if (!termFrequency) {
      return 0;
    }

    return this.scoreWithTokens(
      new Set(tokenize(query)),
      termFrequency,
      this.documentLengths.get(docId) ?? sum([...termFrequency.values()]),
      this.getIdf(),
      this.averageLength()
    );
  }

  search(query: string, topK: number, filters: JsonObject = {}): readonly (readonly [string, number])[] {
    const queryTokens = new Set(tokenize(query));
    const idf = this.getIdf();
    const averageLength = this.averageLength();
    const results: (readonly [string, number])[] = [];

    for (const [docId, termFrequency] of this.termFrequencies) {
      if (!this.matchesFilters(docId, filters)) {
        continue;
      }

      const score = this.scoreWithTokens(
        queryTokens,
        termFrequency,
        this.documentLengths.get(docId) ?? sum([...termFrequency.values()]),
        idf,
        averageLength
      );

      if (score > 0) {
        results.push([docId, score]);
      }
    }

    return results.sort((left, right) => right[1] - left[1]).slice(0, Math.max(0, topK));
  }

  getContent(docId: string): string | undefined {
    return this.docContents.get(docId);
  }

  getMetadata(docId: string): JsonObject {
    return this.docMetadata.get(docId) ?? {};
  }

  clear(): void {
    this.docContents.clear();
    this.docMetadata.clear();
    this.termFrequencies.clear();
    this.documentLengths.clear();
    this.documentFrequency.clear();
    this.idfCache.clear();
    this.totalLength = 0;
  }

  size(): number {
    return this.termFrequencies.size;
  }

  private averageLength(): number {
    return this.termFrequencies.size === 0 || this.totalLength === 0
      ? 1
      : this.totalLength / this.termFrequencies.size;
  }

  private getIdf(): Map<string, number> {
    if (this.idfCache.size > 0) {
      return this.idfCache;
    }

    const documentCount = this.termFrequencies.size;
    this.idfCache = new Map(
      [...this.documentFrequency.entries()].map(([token, frequency]) => [
        token,
        Math.log((documentCount - frequency + 0.5) / (frequency + 0.5) + 1)
      ])
    );
    return this.idfCache;
  }

  private scoreWithTokens(
    queryTokens: ReadonlySet<string>,
    termFrequency: ReadonlyMap<string, number>,
    documentLength: number,
    idf: ReadonlyMap<string, number>,
    averageLength: number
  ): number {
    let score = 0;

    for (const token of queryTokens) {
      const frequency = termFrequency.get(token) ?? 0;
      const idfScore = idf.get(token) ?? 0;
      const numerator = frequency * (this.k1 + 1);
      const denominator = frequency + this.k1 * (1 - this.b + (this.b * documentLength) / averageLength);
      score += denominator === 0 ? 0 : idfScore * (numerator / denominator);
    }

    return score;
  }

  private matchesFilters(docId: string, filters: JsonObject): boolean {
    if (Object.keys(filters).length === 0) {
      return true;
    }

    const metadata = this.docMetadata.get(docId);

    if (!metadata) {
      return false;
    }

    return Object.entries(filters).every(([key, expected]) => String(metadata[key]) === String(expected));
  }
}

export class InMemoryRagCorpus implements DocumentRetriever {
  private readonly scorer = new Bm25Scorer();
  private readonly documents = new Map<string, RagDocument>();
  private readonly chunker?: DocumentChunker;
  private readonly tokenEstimator: TokenEstimator;

  constructor(options: InMemoryRagCorpusOptions = {}) {
    this.chunker = options.chunker;
    this.tokenEstimator = options.tokenEstimator ?? createApproximateTokenEstimator();
  }

  add(document: RagDocument): readonly RagDocument[] {
    const chunks = this.chunker ? this.chunker.chunk(document) : [document];

    for (const chunk of chunks) {
      this.documents.set(chunk.id, chunk);
      this.scorer.index(chunk.id, chunk.content, chunk.metadata);
    }

    return chunks;
  }

  addText(content: string, metadata: JsonObject = {}, source?: string): readonly RagDocument[] {
    return this.add({
      content,
      id: createRunId("rag_doc"),
      metadata,
      source
    });
  }

  get(id: string): RagDocument | undefined {
    return this.documents.get(id);
  }

  retrieve(queries: readonly string[], topK: number, filters: JsonObject = {}): readonly RetrievedDocument[] {
    const merged = new Map<string, number>();

    for (const query of queries) {
      for (const [docId, score] of this.scorer.search(query, topK, filters)) {
        merged.set(docId, Math.max(merged.get(docId) ?? 0, score));
      }
    }

    return [...merged.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, Math.max(0, topK))
      .flatMap(([docId, score]) => {
        const document = this.documents.get(docId);

        if (!document) {
          return [];
        }

        return [
          {
            ...document,
            estimatedTokens: this.tokenEstimator.estimate(document.content),
            score
          }
        ];
      });
  }

  clear(): void {
    this.documents.clear();
    this.scorer.clear();
  }

  size(): number {
    return this.documents.size;
  }
}

export class SimpleReranker implements DocumentReranker {
  rerank(query: string, documents: readonly RetrievedDocument[], topK: number): readonly RetrievedDocument[] {
    const queryTokens = new Set(tokenize(query));

    return [...documents]
      .map((document) => ({
        document,
        score: document.score + overlapScore(queryTokens, new Set(tokenize(document.content)))
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(0, topK))
      .map(({ document, score }) => ({ ...document, score }));
  }
}

export class SimpleContextBuilder implements ContextBuilder {
  constructor(private readonly separator = "\n\n---\n\n") {}

  build(documents: readonly RetrievedDocument[], maxTokens: number): string {
    const sections: string[] = [];
    let currentTokens = 0;
    let index = 1;

    for (const document of documents) {
      if (currentTokens + document.estimatedTokens > maxTokens) {
        break;
      }

      const source = document.source ? ` Source: ${document.source}` : "";
      sections.push(`[${index}]${source}\n${document.content}`);
      currentTokens += document.estimatedTokens;
      index += 1;
    }

    return sections.join(this.separator);
  }
}

export class StructuredContextBuilder implements ContextBuilder {
  build(documents: readonly RetrievedDocument[], maxTokens: number): string {
    const selected: JsonObject[] = [];
    let currentTokens = 0;

    for (const document of documents) {
      if (currentTokens + document.estimatedTokens > maxTokens) {
        break;
      }

      selected.push({
        content: document.content,
        id: document.id,
        metadata: document.metadata,
        score: document.score,
        source: document.source ?? null
      });
      currentTokens += document.estimatedTokens;
    }

    return JSON.stringify({ documents: selected }, null, 2);
  }
}

export class PassthroughQueryTransformer implements QueryTransformer {
  transform(query: string): readonly string[] {
    return [query];
  }
}

export class DefaultRagPipeline implements RagPipeline {
  private readonly queryTransformer?: QueryTransformer;
  private readonly retriever: DocumentRetriever;
  private readonly reranker?: DocumentReranker;
  private readonly contextCompressor?: ContextCompressor;
  private readonly contextBuilder: ContextBuilder;
  private readonly maxContextTokens: number;
  private readonly tokenEstimator: TokenEstimator;

  constructor(options: DefaultRagPipelineOptions) {
    this.queryTransformer = options.queryTransformer;
    this.retriever = options.retriever;
    this.reranker = options.reranker;
    this.contextCompressor = options.contextCompressor;
    this.contextBuilder = options.contextBuilder ?? new StructuredContextBuilder();
    this.maxContextTokens = options.maxContextTokens ?? defaultMaxContextTokens;
    this.tokenEstimator = options.tokenEstimator ?? createApproximateTokenEstimator();
  }

  async retrieve(query: RagQuery): Promise<RagContext> {
    const queries = this.queryTransformer
      ? await this.queryTransformer.transform(query.query)
      : [query.query];
    const topK = query.topK ?? defaultTopK;
    const documents = await this.retriever.retrieve(queries, topK, query.filters);

    if (documents.length === 0) {
      return emptyRagContext;
    }

    const reranked = query.rerank !== false && this.reranker
      ? await this.reranker.rerank(query.query, documents, topK)
      : documents.slice(0, topK);
    const compressed = this.contextCompressor
      ? await this.contextCompressor.compress(query.query, reranked)
      : reranked;

    if (compressed.length === 0) {
      return emptyRagContext;
    }

    const context = this.contextBuilder.build(compressed, this.maxContextTokens);

    return {
      context,
      documents: compressed,
      totalTokens: this.tokenEstimator.estimate(context)
    };
  }
}

export function rrfFuse(
  vectorResults: readonly (readonly [string, number])[],
  bm25Results: readonly (readonly [string, number])[],
  options: {
    readonly bm25Weight?: number;
    readonly k?: number;
    readonly vectorWeight?: number;
  } = {}
): readonly (readonly [string, number])[] {
  const scores = new Map<string, number>();
  accumulateRrf(scores, vectorResults, options.vectorWeight ?? 0.5, options.k ?? 60);
  accumulateRrf(scores, bm25Results, options.bm25Weight ?? 0.5, options.k ?? 60);
  return [...scores.entries()].sort((left, right) => right[1] - left[1]);
}

export function chunkId(documentId: string, index: number): string {
  return `${documentId}::chunk-${index}`;
}

export function tokenize(text: string): readonly string[] {
  const normalized = text.toLowerCase();
  const words = normalized.split(/[^a-z0-9가-힣]+/u).filter((word) => word.length >= minTokenLength);
  const extra: string[] = [];

  for (const word of words) {
    for (const run of word.matchAll(/[가-힣]{2,}/gu)) {
      const value = run[0];

      for (let start = 0; start < value.length; start += 1) {
        for (let length = minTokenLength; length <= Math.min(maxKoreanNgramLength, value.length - start); length += 1) {
          const token = value.slice(start, start + length);

          if (token !== word) {
            extra.push(token);
          }
        }
      }
    }
  }

  return [...words, ...extra];
}

function countTerms(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

function overlapScore(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const token of left) {
    if (right.has(token)) {
      matches += 1;
    }
  }

  return matches / left.size;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function accumulateRrf(
  scores: Map<string, number>,
  results: readonly (readonly [string, number])[],
  weight: number,
  k: number
): void {
  results.forEach(([documentId], rank) => {
    scores.set(documentId, (scores.get(documentId) ?? 0) + weight / (k + rank + 1));
  });
}

const sentenceEnds = new Set([".", "!", "?", "。", "！", "？"]);
