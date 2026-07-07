/**
 * `runGroundedRecall` — the deep entry point of the grounded-recall wedge
 * (docs/recall-extraction-design.md phase 3): one call that retrieves from the
 * notes corpus, builds the citation-contracted prompt, generates through an
 * injected model callback, and passes the answer through the SAME deterministic
 * gates every Muse surface must sit behind — `enforceAnswerCitations` (a
 * fabricated source is removed by code), refusal citation-stripping (an honest
 * "I'm not sure" never carries a citation), and the embedder-aware retrieval
 * confidence verdict.
 *
 * Provider-neutral and I/O-injected: the caller supplies `embedFn` and
 * `generateAnswer` (the CLI binds its models.json-merged Ollama; the API binds
 * the server's ModelProvider; tests bind deterministic fakes), so the pipeline
 * itself never resolves credentials or vendors.
 */

import { citedSourcesIn, detectEvidenceContradictions, enforceAnswerCitations, withUngroundableFallback } from "@muse/agent-core";

import { CITATION_INSTRUCTION_LINES } from "./ask-prompt-constants.js";
import { createCitationStreamFilter } from "./citation-stream.js";
import { retrieveAndRankNotes } from "./ask-note-retrieval.js";
import { notesGroundingFraming, type ScoredChunk } from "./chunks.js";
import { loadIndex, type ReindexSummary } from "./notes-index.js";
import { buildNoteContextBlock, formatSourceReceipts, relativizeNoteSource } from "./present.js";
import { answerIsRefusal, stripEchoedCiteAs } from "./text.js";

export interface GroundedRecallSources {
  /** The notes corpus root — cited paths are shown relative to it. */
  readonly notesDir: string;
  /** The prebuilt vector index (`muse notes reindex` / `reindexNotes` output). */
  readonly notesIndexFile: string;
}

export interface GroundedRecallOptions {
  /** Omitted ⇒ the index's own model (the only model its cosines are valid for). */
  readonly embedModel?: string;
  readonly answerModel: string;
  readonly topK?: number;
  /** Restrict grounding to notes under this corpus subfolder. */
  readonly scope?: string;
  readonly temperature?: number;
}

export interface GroundedRecallRuntime {
  /** Embed via the caller's resolved endpoint. */
  readonly embedFn: (text: string, model: string) => Promise<number[]>;
  /** One buffered completion; the caller adapts its ModelProvider. */
  readonly generateAnswer: (args: {
    readonly system: string;
    readonly user: string;
    readonly model: string;
    readonly temperature?: number;
  }) => Promise<string>;
  /**
   * Token-delta streaming, when the caller's provider supports it. Optional —
   * absent, `streamGroundedRecall` degrades to one gate-clean delta after the
   * buffered generation.
   */
  readonly streamAnswer?: (args: {
    readonly system: string;
    readonly user: string;
    readonly model: string;
    readonly temperature?: number;
  }) => AsyncIterable<string>;
}

export interface GroundedRecallInput {
  readonly query: string;
  readonly sources: GroundedRecallSources;
  readonly options: GroundedRecallOptions;
  readonly runtime: GroundedRecallRuntime;
}

export interface GroundedRecallResult {
  /** The citation-enforced answer (fabricated sources already removed by code). */
  readonly answer: string;
  /** Embedder-aware retrieval confidence over the pre-gap-cut distribution. */
  readonly verdict: "confident" | "ambiguous" | "none";
  /** Sources the surviving answer actually cites (relative note paths). */
  readonly citations: readonly string[];
  /** Fabricated citations the gate stripped — non-empty means the model invented a source. */
  readonly strippedCitations: readonly string[];
  /** "from your note of …" receipt block, when the answer cited something. */
  readonly receipts?: string;
  /** True when the answer is an honest abstention (carries no citation by construction). */
  readonly refusal: boolean;
  /** True when the embedding endpoint failed and the corpus contributed nothing. */
  readonly notesUnavailable: boolean;
  /** How many corpus chunks were in the prompt window (grounding breadth signal). */
  readonly groundedChunkCount: number;
}

/**
 * Resolve the corpus + the embed model together: an explicit `embedModel` must
 * match the index (a cross-model cosine is meaningless — mismatch ⇒ empty
 * corpus); omitted, the index's own model is used.
 */
async function resolveIndexForModel(
  indexFile: string,
  requestedEmbedModel: string | undefined
): Promise<{ readonly files: ReindexSummary["index"]["files"]; readonly embedModel: string | undefined }> {
  const index = await loadIndex(indexFile);
  if (!index) {
    return { embedModel: requestedEmbedModel, files: [] };
  }
  const embedModel = requestedEmbedModel ?? index.model;
  return { embedModel, files: index.model === embedModel ? index.files : [] };
}

function buildSystemPrompt(args: {
  readonly framing: { readonly header: string; readonly guidance?: string };
  readonly contextBlock: string;
}): string {
  return [
    "You are Muse, the user's personal AI. Answer the user's question ONLY from the context below.",
    ...CITATION_INSTRUCTION_LINES,
    ...(args.framing.guidance ? [args.framing.guidance] : []),
    "",
    args.framing.header,
    args.contextBlock
  ].join("\n");
}

/**
 * The live event stream of `streamGroundedRecall`. `answer-delta` text has
 * already passed the LIVE citation filter — a fabricated `[from …]` never
 * reaches a display, not even for a flash (the buffered gate then remains the
 * authoritative pass on the full answer). The final event is always `result`.
 */
export type GroundedRecallEvent =
  | {
    readonly type: "retrieval";
    readonly groundedChunkCount: number;
    readonly verdict: "confident" | "ambiguous" | "none";
    readonly notesUnavailable: boolean;
  }
  | { readonly type: "answer-delta"; readonly text: string }
  | { readonly type: "result"; readonly result: GroundedRecallResult };

interface PreparedRecall {
  readonly systemPrompt: string;
  readonly allowedNotes: readonly string[];
  readonly scored: readonly ScoredChunk[];
  readonly verdict: "confident" | "ambiguous" | "none";
  readonly notesUnavailable: boolean;
}

/** Retrieval + context + prompt — everything before the model speaks. */
async function prepareRecall(input: GroundedRecallInput): Promise<PreparedRecall> {
  const { query, sources, options, runtime } = input;
  const topK = options.topK ?? 6;

  const { embedModel, files: indexFiles } = await resolveIndexForModel(sources.notesIndexFile, options.embedModel);
  const retrieval = await retrieveAndRankNotes({
    embedFn: runtime.embedFn,
    embedModel: embedModel ?? "",
    indexFiles,
    json: true,
    notesDir: sources.notesDir,
    onStderr: () => {},
    query,
    scope: options.scope,
    topK
  });

  const framing = notesGroundingFraming(retrieval.scored, query, retrieval.preGapScored, embedModel);
  const contradictions = await detectEvidenceContradictions(
    retrieval.scored.map((s: ScoredChunk) => ({ cosine: s.score, score: s.score, source: s.file, text: s.chunk.text })),
    (text) => runtime.embedFn(text, embedModel ?? "")
  ).catch(() => [] as const);
  const contextBlock = buildNoteContextBlock(retrieval.scored, contradictions, sources.notesDir);

  return {
    allowedNotes: [...new Set(retrieval.scored.map((s) => relativizeNoteSource(s.file, sources.notesDir)))],
    notesUnavailable: retrieval.notesUnavailable,
    scored: retrieval.scored,
    systemPrompt: buildSystemPrompt({ contextBlock, framing }),
    verdict: framing.verdict
  };
}

/** The deterministic gates over the full raw answer — shared by both entry points. */
function finalizeRecall(raw: string, prepared: PreparedRecall, input: GroundedRecallInput): GroundedRecallResult {
  const enforced = enforceAnswerCitations(stripEchoedCiteAs(raw), { notes: [...prepared.allowedNotes] });
  // Every sentence can be dropped as un-groundable (the citation-gate clause-leak
  // fix) — an empty string there would read as a silent bug, not an honest
  // abstention, so surface the SAME fixed hedge every other refusal uses.
  let answer = withUngroundableFallback(enforced).trim();
  const strippedCitations = [...enforced.stripped];

  // An honest abstention must not carry a citation — a model that says
  // "I'm not sure [from x.md]" is laundering confidence it doesn't have.
  const refusal = answerIsRefusal(answer);
  if (refusal && citedSourcesIn(answer).length > 0) {
    const strippedRefusal = enforceAnswerCitations(answer, { notes: [] });
    strippedCitations.push(...strippedRefusal.stripped);
    answer = withUngroundableFallback(strippedRefusal).trim();
  }

  const citations = [...new Set(citedSourcesIn(answer))];
  const receipts = formatSourceReceipts(
    answer,
    input.sources.notesDir,
    prepared.scored.map((s) => ({ file: relativizeNoteSource(s.file, input.sources.notesDir), text: s.chunk.text })),
    input.query
  );

  return {
    answer,
    citations,
    groundedChunkCount: prepared.scored.length,
    notesUnavailable: prepared.notesUnavailable,
    ...(receipts !== undefined ? { receipts } : {}),
    refusal,
    strippedCitations,
    verdict: prepared.verdict
  };
}

/**
 * The streaming form of the seam. Deltas pass through the LIVE citation filter
 * (`createCitationStreamFilter` over the same `enforceAnswerCitations` set), so
 * a fabricated citation never flashes on a display; the buffered gate then runs
 * over the FULL answer and the final `result` event is the authoritative one
 * (identical to `runGroundedRecall`'s). Without `runtime.streamAnswer`, the
 * buffered generation is used and the single delta is the already-gated answer.
 */
export async function* streamGroundedRecall(input: GroundedRecallInput): AsyncGenerator<GroundedRecallEvent> {
  const prepared = await prepareRecall(input);
  yield {
    groundedChunkCount: prepared.scored.length,
    notesUnavailable: prepared.notesUnavailable,
    type: "retrieval",
    verdict: prepared.verdict
  };

  const generateArgs = {
    model: input.options.answerModel,
    system: prepared.systemPrompt,
    ...(input.options.temperature !== undefined ? { temperature: input.options.temperature } : {}),
    user: input.query
  };

  let raw = "";
  if (input.runtime.streamAnswer) {
    const filter = createCitationStreamFilter(
      (span) => enforceAnswerCitations(span, { notes: [...prepared.allowedNotes] }).text
    );
    for await (const delta of input.runtime.streamAnswer(generateArgs)) {
      raw += delta;
      const safe = filter.push(delta);
      if (safe.length > 0) {
        yield { text: safe, type: "answer-delta" };
      }
    }
    const tail = filter.flush();
    if (tail.length > 0) {
      yield { text: tail, type: "answer-delta" };
    }
    const result = finalizeRecall(raw, prepared, input);
    yield { result, type: "result" };
    return;
  }

  raw = await input.runtime.generateAnswer(generateArgs);
  const result = finalizeRecall(raw, prepared, input);
  if (result.answer.length > 0) {
    yield { text: result.answer, type: "answer-delta" };
  }
  yield { result, type: "result" };
}

export async function runGroundedRecall(input: GroundedRecallInput): Promise<GroundedRecallResult> {
  // Single implementation: the buffered form consumes the stream and returns
  // its authoritative final event.
  let final: GroundedRecallResult | undefined;
  for await (const event of streamGroundedRecall(input)) {
    if (event.type === "result") {
      final = event.result;
    }
  }
  if (!final) {
    throw new Error("streamGroundedRecall ended without a result event");
  }
  return final;
}
