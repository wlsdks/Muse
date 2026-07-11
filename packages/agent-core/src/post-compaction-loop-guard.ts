/**
 * Post-compaction loop guard — catches a stuck tool call that SURVIVES
 * context compaction.
 *
 * `ToolLoopProgressTracker` (tool-loop-progress.ts) detects a general
 * no-progress spin from token-Jaccard similarity across READ observations.
 * That is a good floor, but it is blind to the specific failure this guard
 * targets: a compaction just fired (a summary was inserted, dropping old
 * turns) and the model — now missing the context that would have told it
 * to stop — re-issues the EXACT SAME tool call it was stuck on before the
 * compaction. The general stall detector eventually catches this too, but
 * only after its own window fills post-compaction; arming a dedicated,
 * exact-signature counter right at the compaction event catches the
 * specific "compaction didn't break the loop" case sooner and
 * unambiguously (no similarity threshold to tune).
 *
 * Exact-signature, not similarity: this asks "is this the SAME call,
 * repeated" (tool name + args + result), which is the intent-preserving
 * signal for "compaction failed to break THIS exact loop" — a different
 * call, or the same call with a genuinely different result, is not a
 * repeat and never trips it.
 */

import type { ModelToolCall } from "@muse/model";

import { stableJson } from "./tool-call-deduplicator.js";

export const POST_COMPACTION_GUARD_WINDOW = 3;

/** Tool name + stable-hashed args + stable-hashed result — the same call, same outcome, again. */
export function buildPostCompactionSignature(toolCall: ModelToolCall, resultOutput: string): string {
  return `${toolCall.name}:${stableJson(toolCall.arguments)}:${stableJson(resultOutput)}`;
}

/**
 * True iff the last `window` signatures are all identical to the most
 * recent one. Fewer than `window` signatures → not yet a repeat (need
 * `window` observations of evidence, same floor as the general stall
 * detector). Pure, deterministic, never throws.
 */
export function detectPostCompactionLoop(
  signatures: readonly string[],
  window: number = POST_COMPACTION_GUARD_WINDOW
): boolean {
  const w = Math.max(2, Math.trunc(window));
  if (signatures.length < w) return false;
  const last = signatures.slice(-w);
  return last.every((signature) => signature === last[0]);
}

/**
 * Stateful wrapper for the tool loop. `arm()` is called once, at the
 * compaction event, and starts a fresh counting window — a partial streak
 * from BEFORE the compaction never counts toward the post-compaction
 * repeat, since the whole point is "did compaction fail to break THIS
 * loop". Before `arm()` is ever called, `record()` is a no-op (always
 * `false`) — a run with no compaction is unaffected, matching today's
 * behaviour exactly.
 */
export class PostCompactionLoopGuard {
  private armed = false;
  private signatures: string[] = [];
  private readonly window: number;

  constructor(window: number = POST_COMPACTION_GUARD_WINDOW) {
    this.window = window;
  }

  arm(): void {
    this.armed = true;
    this.signatures = [];
  }

  /** Record one executed tool call's signature. Returns true when the guard should abort the run. */
  record(signature: string): boolean {
    if (!this.armed) return false;
    this.signatures.push(signature);
    return detectPostCompactionLoop(this.signatures, this.window);
  }
}
