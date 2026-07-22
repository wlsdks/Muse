/**
 * CMP-2 — auxiliary-model compaction.
 *
 * When a turn drops old context to fit the window, the deterministic
 * summary (`[Key details]` salient facts) is the FLOOR. This adds an
 * OPTIONAL richer summary produced by a cheap auxiliary model (e.g. a
 * second local Ollama gemma4 call) over the dropped messages, while the
 * main inference model stays on the user's task.
 *
 * Two non-negotiables shape it:
 *  - MODEL-AGNOSTIC: the summarizer is INJECTED (a `(messages) => Promise<string>`),
 *    so agent-core / @muse/memory never reference a vendor SDK (architecture.md).
 *  - FAIL-OPEN to deterministic (CMP-1 principle): a local agent MUST
 *    survive a compression-engine failure. Any throw, timeout-rejection,
 *    or empty/whitespace result falls back to the deterministic summary —
 *    compaction never stalls or loses the floor because the aux model was
 *    slow, down, or returned junk.
 */

import type { ConversationMessage } from "./index.js";

export interface DroppedContextSummarizerOptions {
  /**
   * When set, the summarizer is asked to preserve full detail about this
   * topic while still recording other decisions/facts tersely (hermes'
   * `/compact <focus>` pattern, adapted). A summarizer that ignores it is
   * still valid — the option is advisory, not required.
   */
  readonly focusTopic?: string;
  /** Caller-owned cancellation propagated through staged auxiliary work. */
  readonly signal?: AbortSignal;
}

export type DroppedContextSummarizer = (
  messages: readonly ConversationMessage[],
  options?: DroppedContextSummarizerOptions
) => Promise<string>;

export interface SummarizeDroppedOptions {
  /** Deterministic summary to use when the aux summarizer is absent or fails. */
  readonly fallback: string;
  /** Optional hard cap on the aux summary length; longer output is truncated. */
  readonly maxChars?: number;
  /** Forwarded verbatim to the summarizer as `DroppedContextSummarizerOptions.focusTopic`. */
  readonly focusTopic?: string;
  readonly signal?: AbortSignal;
}

/**
 * Summarize DROPPED context with an aux model, failing open to the
 * deterministic `fallback`. Returns `fallback` when there is no
 * summarizer, nothing was dropped, the summarizer throws, or it yields an
 * empty/whitespace string. A successful summary is trimmed and (if
 * `maxChars` is set) truncated. Pure orchestration — no model coupling.
 */
export async function summarizeDroppedContext(
  dropped: readonly ConversationMessage[],
  summarizer: DroppedContextSummarizer | undefined,
  options: SummarizeDroppedOptions
): Promise<string> {
  if (!summarizer || dropped.length === 0) {
    return options.fallback;
  }
  try {
    options.signal?.throwIfAborted();
    const callOptions = options.focusTopic || options.signal
      ? {
          ...(options.focusTopic ? { focusTopic: options.focusTopic } : {}),
          ...(options.signal ? { signal: options.signal } : {})
        }
      : undefined;
    const raw = await summarizer(dropped, callOptions);
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length === 0) {
      return options.fallback;
    }
    return options.maxChars !== undefined && options.maxChars > 0 && trimmed.length > options.maxChars
      ? trimmed.slice(0, options.maxChars)
      : trimmed;
  } catch (error) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? error;
    }
    return options.fallback;
  }
}

/**
 * Default per-chunk budget for {@link chunkDroppedOnToolPairs} when the
 * caller doesn't set one. Small enough that a chunky aux-model call still
 * leaves the transcript intact rather than getting truncated by the
 * model's own output limits.
 */
export const DEFAULT_CHUNK_MAX_CHARS = 4_000;

/**
 * Split dropped messages into chunks bounded by `chunkMaxChars` (summed
 * content length), splitting ONLY at a safe boundary: a chunk never closes
 * immediately before a `role: "tool"` message, because a tool result
 * belongs with the assistant message that produced it — summarizing it
 * alone loses the call it's answering. A single assistant/tool pair that
 * alone exceeds `chunkMaxChars` still becomes one (oversized) chunk;
 * correctness (never split a pair) beats the budget.
 */
export function chunkDroppedOnToolPairs(
  dropped: readonly ConversationMessage[],
  chunkMaxChars: number
): readonly (readonly ConversationMessage[])[] {
  const chunks: ConversationMessage[][] = [];
  let current: ConversationMessage[] = [];
  let currentChars = 0;

  for (const message of dropped) {
    const messageChars = typeof message.content === "string" ? message.content.length : 0;
    const isToolResult = message.role === "tool";
    if (!isToolResult && current.length > 0 && currentChars + messageChars > chunkMaxChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(message);
    currentChars += messageChars;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Staged variant of {@link summarizeDroppedContext}: chunks the dropped
 * window on tool-pair boundaries and summarizes each chunk independently
 * before merging, so a large dropped context isn't handed to the aux
 * model as one huge transcript (fidelity loss / truncation). A single
 * small chunk delegates straight to `summarizeDroppedContext`, so a small
 * dropped context sees byte-identical behavior to today.
 *
 * Each chunk fails open to `""` on its own (never the overall `fallback`)
 * so one bad/failing chunk doesn't discard the others — the succeeded
 * chunk summaries are merged. Only when EVERY chunk fails does this
 * return `options.fallback`, the same deterministic floor as before.
 *
 * Each chunk's own summary is capped at `options.maxChars` (the SAME cap
 * the final merged result respects) — a chunk never needs more than the
 * overall budget on its own, and the merge step only has to trim the
 * combined length down to that same cap.
 */
export async function summarizeDroppedContextInStages(
  dropped: readonly ConversationMessage[],
  summarizer: DroppedContextSummarizer | undefined,
  options: SummarizeDroppedOptions & { readonly chunkMaxChars?: number }
): Promise<string> {
  const chunkMaxChars = options.chunkMaxChars ?? DEFAULT_CHUNK_MAX_CHARS;
  const chunks = chunkDroppedOnToolPairs(dropped, chunkMaxChars);

  if (chunks.length === 0) {
    return options.fallback;
  }
  if (chunks.length === 1) {
    return summarizeDroppedContext(dropped, summarizer, options);
  }

  const chunkSummaries: string[] = [];
  for (const chunk of chunks) {
    const chunkSummary = await summarizeDroppedContext(chunk, summarizer, {
      fallback: "",
      maxChars: options.maxChars,
      focusTopic: options.focusTopic,
      signal: options.signal
    });
    if (chunkSummary.length > 0) {
      chunkSummaries.push(chunkSummary);
    }
  }

  if (chunkSummaries.length === 0) {
    return options.fallback;
  }
  const merged = chunkSummaries.join("\n");
  return options.maxChars !== undefined && options.maxChars > 0 && merged.length > options.maxChars
    ? merged.slice(0, options.maxChars)
    : merged;
}
