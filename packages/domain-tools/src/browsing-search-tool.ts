/**
 * `browsing_search` agent tool — search the user's LOCAL Chrome
 * browsing-history archive (`~/.muse/browsing.json`, populated by
 * `muse browsing sync`) by keyword so a conversation can answer "that
 * blog about X I read last week". Read-only, deterministic substring
 * match — no model call, no egress. The archive is 100% local; this
 * tool never touches the network or the live Chrome file.
 */

import type { JsonObject } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

/**
 * The shape the tool reads. Structurally compatible with the recall
 * `BrowsingVisit`, declared here so @muse/domain-tools owns the tool
 * without depending on @muse/recall.
 */
export interface BrowsingVisitLike {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly visitedAt?: string;
}

export interface BrowsingSearchToolDeps {
  /** Local browsing visits, newest first (the runtime caps how many are read). */
  readonly browsingVisits: () => Promise<readonly BrowsingVisitLike[]> | readonly BrowsingVisitLike[];
}

export function createBrowsingSearchTool(deps: BrowsingSearchToolDeps): MuseTool {
  return {
    definition: {
      description:
        "Search the user's LOCAL Chrome browsing history (pages they visited) by keyword, newest first. Use when the user asks about a page/article/site they visited or read before ('that blog about X I read last week' / '지난주에 본 X 글'). Do NOT use for a fresh public web search or for their RSS feed subscriptions (feeds_search). Read-only, local-only.",
      domain: "knowledge",
      inputSchema: {
        additionalProperties: false,
        properties: {
          limit: { description: "Max visits to return, e.g. 5. Defaults to 10.", maximum: 50, minimum: 1, type: "integer" },
          query: { description: "Keyword(s) to match against page titles and URLs, e.g. 'rust ownership'.", type: "string" }
        },
        required: ["query"],
        type: "object"
      },
      keywords: ["browsing", "history", "visited", "page", "site", "방문", "봤던", "히스토리", "브라우저"],
      name: "browsing_search",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const query = typeof args["query"] === "string" ? args["query"].trim() : "";
      const rawLimit = args["limit"];
      const limit = typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(50, Math.trunc(rawLimit)) : 10;
      if (query.length === 0) {
        return { count: 0, found: false, hits: [], reason: "query is required (e.g. 'rust ownership')" };
      }
      const needle = query.toLowerCase();
      const visits = await deps.browsingVisits();
      const hits = visits
        .filter((v) => `${v.title} ${v.url}`.toLowerCase().includes(needle))
        .slice(0, limit)
        .map((v) => ({
          id: v.id,
          title: v.title,
          url: v.url,
          ...(v.visitedAt ? { visitedAt: v.visitedAt } : {})
        }));
      return { count: hits.length, hits, limit, query };
    }
  };
}
