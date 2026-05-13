import type { JsonObject, JsonValue } from "@muse/shared";

import type { LoopbackMcpServer } from "./loopback.js";
import { readString } from "./loopback-helpers.js";

/**
 * `muse.search` loopback MCP server — model-agnostic web search.
 *
 * Native server-side `web_search` exists on OpenAI / Anthropic /
 * Gemini, but local providers (Qwen, Llama, etc.) don't have it.
 * A JARVIS-class assistant running on a 2B local model still needs
 * to answer "what's the weather in Seoul?" or "what did Apple
 * announce today?". This tool fills the gap with DuckDuckGo's lite
 * HTML endpoint — no API key, no signup, returns 10ish results with
 * title / url / snippet.
 *
 * Bounded by:
 *   - `maxResults` (default 10): hard cap on returned rows
 *   - `timeoutMs` (default 8s): per-request timeout
 *   - HTML parse is regex-based on stable DDG HTML class names;
 *     if the markup shifts and 0 results parse, we return an
 *     explicit `{ error: "parser returned 0 results" }` so the
 *     model knows the call landed but the format drifted.
 */

export interface SearchMcpServerOptions {
  /** Max rows returned to the agent. Default 10. */
  readonly maxResults?: number;
  /** Per-request timeout. Default 8,000ms. */
  readonly timeoutMs?: number;
  /** Optional fetch impl override (used in tests). */
  readonly fetch?: typeof globalThis.fetch;
  /** Override the upstream endpoint (test injection / mirror). */
  readonly endpoint?: string;
}

const DEFAULT_ENDPOINT = "https://html.duckduckgo.com/html/";

/**
 * Built-in web search server. Included in
 * `createDefaultLoopbackMcpServers` so every Muse install gets
 * one — bring-your-own-key search backends can be wired in by the
 * external MCP config when an operator wants a paid provider.
 */
export function createSearchMcpServer(options: SearchMcpServerOptions = {}): LoopbackMcpServer {
  const maxResults = Math.max(1, Math.min(50, options.maxResults ?? 10));
  const timeoutMs = options.timeoutMs ?? 8_000;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return {
    description: "Built-in web search (loopback MCP, DuckDuckGo HTML backend, no API key).",
    name: "muse.search",
    tools: [
      {
        description:
          "Search the public web. Returns up to maxResults rows of { title, url, snippet }. Backed by DuckDuckGo's HTML endpoint — no API key required. Use this when the model doesn't have a native web_search tool (local Qwen / Llama / etc.).",
        execute: async (args): Promise<JsonObject> => {
          const query = readString(args, "query");
          if (!query || query.length === 0) {
            return { error: "query is required" };
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          let html: string;
          try {
            const response = await fetchImpl(`${endpoint}?q=${encodeURIComponent(query)}`, {
              headers: {
                "accept": "text/html",
                "user-agent": "muse-search-loopback/1.0"
              },
              signal: controller.signal
            });
            if (!response.ok) {
              return { error: `search backend responded ${response.status.toString()}` };
            }
            html = await response.text();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { error: `search failed: ${message}` };
          } finally {
            clearTimeout(timer);
          }
          const parsed = parseDuckDuckGoHtml(html, maxResults);
          if (parsed.length === 0) {
            return { error: "parser returned 0 results — backend markup may have shifted" };
          }
          return { query, results: parsed as unknown as JsonValue, total: parsed.length };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            query: { type: "string" }
          },
          required: ["query"],
          type: "object"
        },
        name: "search",
        risk: "read"
      }
    ]
  };
}

interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/**
 * Regex-extract result rows from DuckDuckGo's html.duckduckgo.com/html/
 * markup. Two stable class names since 2019:
 *   - `<a class="result__a" href="…">title</a>`
 *   - `<a class="result__snippet" …>snippet</a>`
 * One full pattern per result block keeps title/url/snippet aligned —
 * a flat per-class sweep would drift if any field is missing.
 */
export function parseDuckDuckGoHtml(html: string, max: number): readonly SearchResult[] {
  const out: SearchResult[] = [];
  const blockRe = /<a\s+rel="nofollow"\s+class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gu;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null && out.length < max) {
    const href = decodeDuckDuckGoRedirect(match[1] ?? "");
    const title = stripTags(match[2] ?? "").trim();
    const snippet = stripTags(match[3] ?? "").trim();
    if (href && title) {
      out.push({ snippet, title, url: href });
    }
  }
  return out;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/gu, "").replace(/&amp;/gu, "&").replace(/&quot;/gu, "\"").replace(/&#x27;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/\s+/gu, " ");
}

/**
 * DDG wraps every result href in `//duckduckgo.com/l/?uddg=<encoded>&…`.
 * Unwrap the `uddg` query param so the model gets the canonical URL.
 */
function decodeDuckDuckGoRedirect(raw: string): string {
  if (!raw.startsWith("//duckduckgo.com/l/") && !raw.startsWith("https://duckduckgo.com/l/")) {
    return raw;
  }
  const queryStart = raw.indexOf("?");
  if (queryStart < 0) return raw;
  const params = new URLSearchParams(raw.slice(queryStart + 1));
  const target = params.get("uddg");
  return target ? decodeURIComponent(target) : raw;
}
