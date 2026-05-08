import { createApproximateTokenEstimator, type TokenEstimator } from "@muse/memory";
import { type JsonObject } from "@muse/shared";
import { structuredContextBuilder } from "./rag-retrievers.js";

export type Awaitable<T> = T | Promise<T>;

export interface RagDocument {
  readonly id: string;
  readonly content: string;
  readonly metadata: JsonObject;
  readonly source?: string;
}

export interface StoredRagDocument extends RagDocument {
  readonly chunkCount: number;
  readonly chunkIds: readonly string[];
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly indexed: boolean;
  readonly updatedAt: Date;
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

export interface DocumentLookup {
  get(id: string): Awaitable<RagDocument | undefined>;
}

export interface EmbeddingModel {
  embed(text: string): Awaitable<readonly number[]>;
}

export interface VectorSearchResult {
  readonly id: string;
  readonly score: number;
}

export interface VectorStore extends DocumentLookup {
  upsert(document: RagDocument, embedding: readonly number[]): Awaitable<void>;
  search(embedding: readonly number[], topK: number, filters?: JsonObject): Awaitable<readonly VectorSearchResult[]>;
}

export interface DocumentReranker {
  rerank(query: string, documents: readonly RetrievedDocument[], topK: number): Awaitable<readonly RetrievedDocument[]>;
}

export interface QueryTransformer {
  transform(query: string): Awaitable<readonly string[]>;
}

export interface ConversationAwareQueryTurn {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ConversationAwareQueryTransformerOptions {
  readonly history?: readonly ConversationAwareQueryTurn[];
  readonly includeOriginal?: boolean;
  readonly maxHistoryTurns?: number;
  readonly maxQueries?: number;
  readonly maxContextChars?: number;
}

export interface HypotheticalDocumentQueryTransformerOptions {
  readonly generate: (query: string) => Awaitable<string>;
  readonly includeOriginal?: boolean;
}

export interface DecomposingQueryTransformerOptions {
  readonly includeOriginal?: boolean;
  readonly maxQueries?: number;
}

export interface ExtractiveContextCompressorOptions {
  readonly maxSentencesPerDocument?: number;
  readonly minScore?: number;
}

export interface ContextCompressor {
  compress(query: string, documents: readonly RetrievedDocument[]): Awaitable<readonly RetrievedDocument[]>;
}

export type ContextBuilder = (
  documents: readonly RetrievedDocument[],
  maxTokens: number
) => string;

export interface RagPipeline {
  retrieve(query: RagQuery): Promise<RagContext>;
}

export interface RetrievalEvalCase {
  readonly id: string;
  readonly query: string;
  readonly expectedDocumentIds?: readonly string[];
  readonly requiredSources?: readonly string[];
  readonly filters?: JsonObject;
  readonly topK?: number;
  readonly maxTotalTokens?: number;
}

export interface RetrievalEvalResult {
  readonly caseId: string;
  readonly passed: boolean;
  readonly recall: number;
  readonly retrievedDocumentIds: readonly string[];
  readonly missingDocumentIds: readonly string[];
  readonly missingSources: readonly string[];
  readonly totalTokens: number;
  readonly reasons: readonly string[];
}

export interface RetrievalEvalRunnerOptions {
  readonly pipeline: RagPipeline;
}

export type RagIngestionCandidateStatus = "PENDING" | "REJECTED" | "INGESTED";

export interface RagIngestionPolicy {
  readonly enabled: boolean;
  readonly requireReview: boolean;
  readonly allowedChannels: readonly string[];
  readonly minQueryChars: number;
  readonly minResponseChars: number;
  readonly blockedPatterns: readonly string[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface RagIngestionCandidate {
  readonly id?: string;
  readonly runId: string;
  readonly userId: string;
  readonly sessionId?: string | null;
  readonly channel?: string | null;
  readonly query: string;
  readonly response: string;
  readonly status?: RagIngestionCandidateStatus;
  readonly capturedAt?: Date;
  readonly reviewedAt?: Date | null;
  readonly reviewedBy?: string | null;
  readonly reviewComment?: string | null;
  readonly ingestedDocumentId?: string | null;
}

export interface StoredRagIngestionCandidate extends Required<Omit<RagIngestionCandidate, "id" | "sessionId" | "channel" | "status" | "capturedAt" | "reviewedAt" | "reviewedBy" | "reviewComment" | "ingestedDocumentId">> {
  readonly id: string;
  readonly sessionId: string | null;
  readonly channel: string | null;
  readonly status: RagIngestionCandidateStatus;
  readonly capturedAt: Date;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly reviewComment: string | null;
  readonly ingestedDocumentId: string | null;
}

export interface RagIngestionPolicyStore {
  getOrNull(): Awaitable<RagIngestionPolicy | undefined>;
  save(policy: RagIngestionPolicy): Awaitable<RagIngestionPolicy>;
  delete(): Awaitable<boolean>;
}

export interface RagIngestionCandidateStore {
  save(candidate: RagIngestionCandidate): Awaitable<StoredRagIngestionCandidate>;
  findById(id: string): Awaitable<StoredRagIngestionCandidate | undefined>;
  findByRunId(runId: string): Awaitable<StoredRagIngestionCandidate | undefined>;
  list(options?: {
    readonly limit?: number;
    readonly status?: RagIngestionCandidateStatus;
    readonly channel?: string;
  }): Awaitable<readonly StoredRagIngestionCandidate[]>;
  updateReview(input: {
    readonly id: string;
    readonly status: Exclude<RagIngestionCandidateStatus, "PENDING">;
    readonly reviewedBy: string;
    readonly reviewComment?: string | null;
    readonly ingestedDocumentId?: string | null;
  }): Awaitable<StoredRagIngestionCandidate | undefined>;
}

export interface RagDocumentInput {
  readonly id?: string;
  readonly content: string;
  readonly metadata?: JsonObject;
  readonly source?: string | null;
  readonly contentHash?: string;
  readonly chunkCount?: number;
  readonly chunkIds?: readonly string[];
  readonly indexed?: boolean;
}

export interface RagDocumentStore {
  save(document: RagDocumentInput): Awaitable<StoredRagDocument>;
  findById(id: string): Awaitable<StoredRagDocument | undefined>;
  findByContentHash(contentHash: string): Awaitable<StoredRagDocument | undefined>;
  list(options?: { readonly limit?: number }): Awaitable<readonly StoredRagDocument[]>;
  search(query: string, options?: { readonly limit?: number }): Awaitable<readonly StoredRagDocument[]>;
  delete(id: string): Awaitable<boolean>;
  deleteMany(ids: readonly string[]): Awaitable<number>;
  count(): Awaitable<number>;
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

export interface HybridDocumentRetrieverOptions {
  readonly lexical: DocumentRetriever;
  readonly vectorStore: VectorStore;
  readonly embeddingModel: EmbeddingModel;
  readonly bm25Weight?: number;
  readonly vectorWeight?: number;
  readonly tokenEstimator?: TokenEstimator;
}

export interface AdaptiveRagRetrieverOptions {
  readonly lexical: DocumentRetriever;
  readonly hybrid: DocumentRetriever;
  readonly route?: (queries: readonly string[]) => "lexical" | "hybrid";
}

export interface ParentDocumentRetrieverOptions {
  readonly childRetriever: DocumentRetriever;
  readonly parentLookup: DocumentLookup | ((id: string) => Awaitable<RagDocument | undefined>);
  readonly tokenEstimator?: TokenEstimator;
}

export interface ChunkMergingRetrieverOptions {
  readonly windowSize?: number;
  readonly separator?: string;
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
// RAG persistence kernel (in-memory + Kysely stores, row mappers,
// upsert query builders, normalize helpers) lives in
// packages/rag/src/rag-stores.ts.
export {
  buildRagIngestionPolicyUpsertQuery,
  createRagDocumentInsert,
  createRagIngestionCandidateInsert,
  createRagIngestionPolicyInsert,
  InMemoryRagDocumentStore,
  InMemoryRagIngestionCandidateStore,
  InMemoryRagIngestionPolicyStore,
  KyselyRagDocumentStore,
  KyselyRagIngestionCandidateStore,
  KyselyRagIngestionPolicyStore,
  mapRagDocumentRow,
  mapRagIngestionCandidateRow,
  mapRagIngestionPolicyRow
} from "./rag-stores.js";


// RAG query transformers + adaptive router + contextual compressors
// live in packages/rag/src/rag-query-transformers.ts.
export {
  ADAPTIVE_QUERY_ROUTER_DEFAULT_SYSTEM_PROMPT,
  ConversationAwareQueryTransformer,
  createLlmAdaptiveQueryRouter,
  createLlmContextualCompressor,
  createLlmDecomposingQueryTransformer,
  createLlmHypotheticalDocumentTransformer,
  DECOMPOSE_DEFAULT_SYSTEM_PROMPT,
  DecomposingQueryTransformer,
  ExtractiveContextCompressor,
  HYDE_DEFAULT_SYSTEM_PROMPT,
  HypotheticalDocumentQueryTransformer,
  LLM_CONTEXTUAL_COMPRESSOR_DEFAULT_SYSTEM_PROMPT,
  parseDecompositionLines,
  parseQueryComplexity,
  PassthroughQueryTransformer,
  type LlmAdaptiveQueryRouterOptions,
  type LlmContextualCompressorOptions,
  type LlmDecomposingQueryTransformerOptions,
  type LlmHypotheticalDocumentTransformerOptions,
  type QueryComplexity,
  type QueryRouter
} from "./rag-query-transformers.js";

// RAG retrieval kernel (chunker, BM25 scorer, in-memory corpus +
// vector store, the four retriever implementations, default reranker,
// context-builder factories, RRF fusion, tokenize / chunkId) lives in
// packages/rag/src/rag-retrievers.ts.
export {
  AdaptiveRagRetriever,
  Bm25Scorer,
  chunkId,
  createChunkMergingRetriever,
  HybridDocumentRetriever,
  InMemoryRagCorpus,
  InMemoryVectorStore,
  ParentDocumentRetriever,
  rrfFuse,
  simpleContextBuilder,
  SimpleReranker,
  structuredContextBuilder,
  TokenBasedDocumentChunker,
  tokenize
} from "./rag-retrievers.js";

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
    this.contextBuilder = options.contextBuilder ?? structuredContextBuilder();
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

    const context = this.contextBuilder(compressed, this.maxContextTokens);

    return {
      context,
      documents: compressed,
      totalTokens: this.tokenEstimator.estimate(context)
    };
  }
}

export class RetrievalEvalRunner {
  private readonly pipeline: RagPipeline;

  constructor(options: RetrievalEvalRunnerOptions) {
    this.pipeline = options.pipeline;
  }

  async runCase(testCase: RetrievalEvalCase): Promise<RetrievalEvalResult> {
    const context = await this.pipeline.retrieve({
      filters: testCase.filters,
      query: testCase.query,
      topK: testCase.topK
    });
    const retrievedDocumentIds = context.documents.map((document) => document.id);
    const expectedDocumentIds = [...new Set(testCase.expectedDocumentIds ?? [])];
    const requiredSources = [...new Set(testCase.requiredSources ?? [])];
    const retrievedIdSet = new Set(retrievedDocumentIds);
    const sourceSet = new Set(context.documents.flatMap((document) => document.source ? [document.source] : []));
    const missingDocumentIds = expectedDocumentIds.filter((id) => !retrievedIdSet.has(id));
    const missingSources = requiredSources.filter((source) => !sourceSet.has(source));
    const recall = expectedDocumentIds.length === 0
      ? 1
      : (expectedDocumentIds.length - missingDocumentIds.length) / expectedDocumentIds.length;
    const reasons: string[] = [];

    if (missingDocumentIds.length > 0) {
      reasons.push(`Missing expected documents: ${missingDocumentIds.join(", ")}`);
    }

    if (missingSources.length > 0) {
      reasons.push(`Missing required sources: ${missingSources.join(", ")}`);
    }

    if (testCase.maxTotalTokens !== undefined && context.totalTokens > testCase.maxTotalTokens) {
      reasons.push(`Context token budget exceeded: ${context.totalTokens} > ${testCase.maxTotalTokens}`);
    }

    return {
      caseId: testCase.id,
      missingDocumentIds,
      missingSources,
      passed: reasons.length === 0,
      reasons,
      recall,
      retrievedDocumentIds,
      totalTokens: context.totalTokens
    };
  }

  async runSuite(cases: readonly RetrievalEvalCase[]): Promise<readonly RetrievalEvalResult[]> {
    const results: RetrievalEvalResult[] = [];

    for (const testCase of cases) {
      results.push(await this.runCase(testCase));
    }

    return results;
  }
}

