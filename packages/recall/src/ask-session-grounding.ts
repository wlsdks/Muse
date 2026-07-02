/**
 * The "second brain" grounding blocks for `muse ask`, lifted out of the
 * commands-ask god-file: past-session episodes (with an auto-refresh of the
 * episode index + untrusted-source tagging), recent watched-feed headlines, and
 * the user's own grounded reflections. Each store read is optional + fail-soft —
 * a missing/unreadable store never breaks the answer, it just contributes no
 * block. Returns the blocks + the hit lists the caller threads into the prompt,
 * the trust signals, and the run-log.
 */

import { buildEpisodeContextBlock, buildFeedContextBlock, recentFeedHeadlines } from "./present.js";
import { rankEpisodeHits } from "./select.js";
import { readEpisodes, readReflections, selectReflectionsForRecall } from "@muse/stores";

import { filterLiveEpisodeEntries } from "./live-files.js";
import { buildEpisodeIndex, defaultEpisodeIndexFile, episodeIndexStale, loadEpisodeIndex, saveEpisodeIndex } from "./episode-index.js";
import { defaultFeedsFile, readFeedsStore } from "./feeds-store.js";

export interface SessionFeedReflectionGrounding {
  readonly episodeHits: Array<{ id: string; summary: string; score: number }>;
  readonly untrustedEpisodeIds: Set<string>;
  readonly episodeBlock: string;
  readonly feedHeadlines: Array<{ feedName: string; title: string; publishedAt: string; summary: string }>;
  readonly feedBlock: string;
  readonly reflectionLines: string[];
  readonly reflectionBlock: string;
}

/**
 * Build the episode / feed / reflection grounding blocks. `queryVec` undefined
 * (notes unavailable) skips the embedding-based episode ranking but still yields
 * empty blocks. `autoReindex` false skips the incremental episode re-embed.
 */
export async function buildSessionFeedReflectionGrounding(params: {
  readonly queryVec: number[] | undefined;
  readonly embedModel: string;
  readonly topK: number;
  readonly autoReindex: boolean;
  readonly onStderr: (text: string) => void;
  /** Resolved episodes-store path (autoconfigure owns resolution above this package). */
  readonly episodesFile: string;
  /** Resolved reflections-store path. */
  readonly reflectionsFile: string;
  /** Embed via the caller's resolved endpoint (the CLI binds the models.json merge). */
  readonly embedFn: (text: string, model: string) => Promise<number[]>;
}): Promise<SessionFeedReflectionGrounding> {
  const { queryVec, embedModel, topK, autoReindex, onStderr, episodesFile, reflectionsFile, embedFn } = params;

  // Auto-refresh the episode index (mirrors the notes auto-reindex) so past
  // sessions stay groundable without a manual `muse episode reindex` —
  // incremental, gated by --no-auto-reindex, fail-soft.
  if (autoReindex && queryVec) {
    try {
      const sourceEpisodes = await readEpisodes(episodesFile);
      const prevIndex = await loadEpisodeIndex(defaultEpisodeIndexFile());
      if (episodeIndexStale(prevIndex, sourceEpisodes, embedModel)) {
        const built = await buildEpisodeIndex({
          embedFn: (text) => embedFn(text, embedModel),
          episodes: sourceEpisodes,
          model: embedModel,
          nowIso: new Date().toISOString(),
          previous: prevIndex
        });
        await saveEpisodeIndex(defaultEpisodeIndexFile(), built.index);
        if (built.embedded > 0) {
          onStderr(`(auto-refreshed episode index: ${built.embedded.toString()} embedded, ${built.skipped.toString()} cached)\n`);
        }
      }
    } catch {
      // episode-index refresh failed — grounding still works on whatever index exists
    }
  }

  // SB-1 (second brain): ground on past-session episode summaries. Same embed
  // model only (a cross-model cosine is meaningless); optional + fail-soft.
  let episodeHits: Array<{ id: string; summary: string; score: number }> = [];
  // Episodes whose session rested on untrusted sources (trusted:false) — tagged so
  // an answer resting solely on a poisoned episode trips the untrusted-only source-
  // check cue instead of being laundered as trusted "your own history".
  let untrustedEpisodeIds = new Set<string>();
  if (queryVec) {
    try {
      const epIndex = await loadEpisodeIndex(defaultEpisodeIndexFile());
      if (epIndex && epIndex.model === embedModel && epIndex.entries.length > 0) {
        const sourceEpisodes = await readEpisodes(episodesFile);
        const liveIds = new Set(sourceEpisodes.map((e) => e.id));
        untrustedEpisodeIds = new Set(sourceEpisodes.filter((e) => e.trusted === false).map((e) => e.id));
        episodeHits = rankEpisodeHits(queryVec, filterLiveEpisodeEntries(epIndex.entries, liveIds), topK);
      }
    } catch {
      // episodes index missing / unreadable — grounding still works
    }
  }
  const episodeBlock = buildEpisodeContextBlock(episodeHits);

  // SB-1/G2: recent watched-feed headlines as world-state knowledge. Time-ordered
  // (not embedded); capped to keep the prompt tight. Optional + fail-soft.
  let feedHeadlines: Array<{ feedName: string; title: string; publishedAt: string; summary: string }> = [];
  try {
    const store = await readFeedsStore(defaultFeedsFile());
    feedHeadlines = recentFeedHeadlines(store.feeds, 8);
  } catch {
    // feeds store missing / unreadable — grounding still works
  }
  const feedBlock = buildFeedContextBlock(feedHeadlines);

  // Dreaming closes the loop: the user's own grounded reflections inform the
  // answer. Insight text only (already grounded); no-op when none. Fail-soft.
  let reflectionLines: string[] = [];
  try {
    reflectionLines = selectReflectionsForRecall(await readReflections(reflectionsFile), Date.now()).slice(0, 5).map((r) => `- ${r.insight}`);
  } catch { /* no reflections — grounding still works */ }
  const reflectionBlock = reflectionLines.length === 0 ? "(none yet)" : reflectionLines.join("\n");

  return { episodeBlock, episodeHits, feedBlock, feedHeadlines, reflectionBlock, reflectionLines, untrustedEpisodeIds };
}
