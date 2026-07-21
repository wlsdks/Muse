/**
 * `feeds_search` agent tool — search the user's watched RSS/Atom feed archive
 * by keyword so a conversation can answer "any news about X in the feeds I
 * follow?". Feeds otherwise reach the model ONLY passively (a bounded slice of
 * recent entries injected as knowledge); without this tool the only on-demand
 * feed search is the opt-in `knowledge_search` (off by default), so in the
 * default posture the model has no way to query the feed archive. Read-only,
 * deterministic substring match — no model call, no egress.
 */

import type { JsonObject } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

/**
 * The shape the tool reads. Structurally compatible with autoconfigure's
 * `FeedEntryLike` (the runtime wires `readFeedKnowledgeEntries`), declared here
 * so @muse/mcp owns the tool without depending on @muse/autoconfigure.
 */
export interface FeedEntryLike {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt?: string;
  readonly feedName?: string;
}

export interface FeedsSearchToolDeps {
  /** Recent watched feed entries, newest first (the runtime caps how many are read). */
  readonly feedEntries: () => Promise<readonly FeedEntryLike[]> | readonly FeedEntryLike[];
}

// A small model forwards the user's phrasing near-verbatim ("any news about Mars"),
// not a distilled keyword — a whole-phrase substring match answers that with a
// false "nothing found". Tokenising and matching on ANY non-stopword token fixes it.
const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "is", "are", "was", "were", "to", "for",
  "and", "or", "any", "about", "some", "that", "this", "these", "those", "with",
  "from", "there", "have", "has", "had", "do", "does", "did", "what", "when",
  "where", "who", "how"
]);

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

const MAX_SUMMARY_CHARS = 300;
const MAX_RESPONSE_BYTES = 4096;

function truncateSummary(summary: string): string {
  return summary.length > MAX_SUMMARY_CHARS ? `${summary.slice(0, MAX_SUMMARY_CHARS)}…` : summary;
}

export function createFeedsSearchTool(deps: FeedsSearchToolDeps): MuseTool {
  return {
    definition: {
      description:
        "Search the user's watched RSS/Atom feed archive (the blogs/news sources they subscribe to) by keyword and return matching entries, newest first. Use when the user asks about news / updates / posts FROM THEIR FEEDS or subscriptions ('any news about X in the feeds I follow?' / '내가 구독한 피드에 X 소식 있어?'). Do NOT use for a fresh public web search (use the web search tool) or for their email inbox (use the email search tool). Read-only.",
      domain: "knowledge",
      inputSchema: {
        additionalProperties: false,
        properties: {
          limit: { description: "Max entries to return, e.g. 5. Defaults to 10.", maximum: 50, minimum: 1, type: "integer" },
          query: {
            description:
              "Word(s) to match against feed entry titles and summaries, e.g. 'Mars mission'. A full sentence works too — matching is per-word (any distinctive word hits), not whole-phrase.",
            type: "string"
          }
        },
        required: ["query"],
        type: "object"
      },
      keywords: ["feed", "feeds", "rss", "subscription", "news", "구독", "피드", "소식"],
      name: "feeds_search",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const query = typeof args["query"] === "string" ? args["query"].trim() : "";
      const rawLimit = args["limit"];
      const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(50, Math.trunc(rawLimit)) : 10;
      if (query.length === 0) {
        return { count: 0, found: false, hits: [], reason: "query is required (e.g. 'Mars mission')" };
      }
      const tokens = tokenize(query);
      // If every word in the query was a stopword, fall back to the whole
      // trimmed phrase rather than matching everything.
      const effectiveTokens = tokens.length > 0 ? tokens : [query.toLowerCase()];
      const entries = await deps.feedEntries();
      const scored = entries
        .map((e) => {
          const haystack = `${e.title} ${e.summary}`.toLowerCase();
          const score = effectiveTokens.filter((t) => haystack.includes(t)).length;
          return { entry: e, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        const example = effectiveTokens[effectiveTokens.length - 1] ?? query;
        return {
          count: 0,
          hits: [],
          limit,
          query,
          reason: `no entry matched any word in '${query}' — try a single distinctive keyword, e.g. '${example}'`
        };
      }

      const capped = scored.slice(0, limit);
      const hits: JsonObject[] = [];
      let bytes = 0;
      for (const { entry: e } of capped) {
        const hit: JsonObject = {
          id: e.id,
          summary: truncateSummary(e.summary),
          title: e.title,
          ...(e.feedName ? { feedName: e.feedName } : {}),
          ...(e.publishedAt ? { publishedAt: e.publishedAt } : {})
        };
        const size = Buffer.byteLength(JSON.stringify(hit), "utf-8");
        if (bytes + size > MAX_RESPONSE_BYTES && hits.length > 0) {
          break;
        }
        hits.push(hit);
        bytes += size;
      }
      const truncatedCount = capped.length - hits.length;
      return { count: hits.length, hits, limit, query, ...(truncatedCount > 0 ? { truncated: truncatedCount } : {}) };
    }
  };
}
