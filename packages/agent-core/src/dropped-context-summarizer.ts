/**
 * CMP-2 production summarizer: turns a Muse `ModelProvider` into a
 * `DroppedContextSummarizer` the runtime can inject. It runs the SAME
 * local model the agent already uses (a second cheap call) over the
 * compacted-away turns to produce a short recap.
 *
 * Model-AGNOSTIC: it takes the Muse `ModelProvider` abstraction, never a
 * vendor SDK, so wiring it keeps agent-core vendor-neutral. A genuine
 * provider failure still PROPAGATES (the fail-open contract lives in
 * `summarizeDroppedContext` in @muse/memory — a throw there becomes the
 * deterministic fallback) so a transient aux failure degrades to the
 * deterministic summary, never crashes the turn.
 *
 * Cooldown / ineffectiveness skip: without this, a persistently-failing
 * aux model (down, malformed response, timeout) re-attempts the LLM call on
 * EVERY subsequent compaction — the "CLI freeze" bug class. A failing call
 * opens a cooldown window; while it's open the returned summarizer skips
 * the LLM call entirely and returns "" (which `summarizeDroppedContext`
 * already treats as "no aux summary" and falls back to the deterministic
 * one) instead of re-attempting. The same cooldown gate also opens after 2
 * consecutive calls that each saved less than `ineffectivenessThreshold` of
 * the transcript length — paying for a model call that isn't helping is as
 * wasteful as paying for one that's failing. The gate is a plain cooldown,
 * not a permanent kill switch: once it expires, the next compaction tries
 * again, and an effective result resets the ineffectiveness streak.
 */

import type { DroppedContextSummarizer } from "@muse/memory";
import type { ModelProvider } from "@muse/model";

const SUMMARIZER_SYSTEM_PROMPT =
  "You compress dropped conversation turns into a short factual recap that preserves names, decisions, and open questions. Output ONLY the recap — no preamble, no headings — in 2 to 4 sentences.";

const DEFAULT_COOLDOWN_MS = 10 * 60_000;
const DEFAULT_INEFFECTIVENESS_THRESHOLD = 0.1;
const DEFAULT_INEFFECTIVENESS_STREAK_LIMIT = 2;

export interface DroppedContextSummarizerOptions {
  /** Injectable clock for deterministic tests. Defaults to `() => new Date()`. */
  readonly now?: () => Date;
  /**
   * How long a failing (or ineffective-streak-tripping) aux call keeps
   * skipping subsequent attempts. Defaults to 10 minutes, matching the
   * reference summarizer-failure cooldown this adapts.
   */
  readonly cooldownMs?: number;
  /**
   * Minimum fraction of the raw transcript length an aux summary must save
   * to count as "effective". A call that saves less counts toward the
   * ineffectiveness streak. Defaults to 0.10 (10%).
   */
  readonly ineffectivenessThreshold?: number;
  /**
   * Number of consecutive ineffective calls that opens the cooldown gate.
   * Defaults to 2.
   */
  readonly ineffectivenessStreakLimit?: number;
}

export function createModelDroppedContextSummarizer(
  provider: ModelProvider,
  model: string,
  options: DroppedContextSummarizerOptions = {}
): DroppedContextSummarizer {
  const now = options.now ?? (() => new Date());
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const ineffectivenessThreshold = options.ineffectivenessThreshold ?? DEFAULT_INEFFECTIVENESS_THRESHOLD;
  const ineffectivenessStreakLimit = options.ineffectivenessStreakLimit ?? DEFAULT_INEFFECTIVENESS_STREAK_LIMIT;

  let cooldownUntilMs = 0;
  let ineffectiveStreak = 0;

  return async (messages) => {
    if (now().getTime() < cooldownUntilMs) {
      return "";
    }

    const transcript = messages
      .map((message) => `${message.role}: ${typeof message.content === "string" ? message.content : ""}`)
      .join("\n");

    let response;
    try {
      response = await provider.generate({
        messages: [
          { content: SUMMARIZER_SYSTEM_PROMPT, role: "system" },
          { content: transcript, role: "user" }
        ],
        model,
        temperature: 0.2
      });
    } catch (error) {
      cooldownUntilMs = now().getTime() + cooldownMs;
      throw error;
    }

    const savedRatio = transcript.length > 0 ? 1 - response.output.length / transcript.length : 1;
    if (savedRatio < ineffectivenessThreshold) {
      ineffectiveStreak += 1;
      if (ineffectiveStreak >= ineffectivenessStreakLimit) {
        cooldownUntilMs = now().getTime() + cooldownMs;
      }
    } else {
      ineffectiveStreak = 0;
    }

    return response.output;
  };
}
