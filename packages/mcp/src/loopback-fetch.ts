import type { JsonObject, JsonValue } from "@muse/shared";

import type { LoopbackMcpServer } from "./loopback.js";
import { readString, readJsonObject } from "./loopback-helpers.js";

/**
 * `muse.fetch` loopback MCP server — bounded HTTP GET/HEAD fetcher.
 *
 * Lifted out of `loopback.ts` (lines 852-1005 of the pre-split
 * version) so the URL-allowlist policy and the small fetch-impl
 * injection seam stay co-located. Same public surface:
 * `FetchMcpServerOptions` + `createFetchMcpServer`. Re-exported from
 * `loopback.ts` so the `@muse/mcp` barrel and existing tests keep
 * working without import-site edits.
 */

export interface FetchMcpServerOptions {
  /**
   * Hostnames the fetcher is permitted to reach. Empty by default — opt-in
   * required. The check matches `URL.hostname` exactly (no wildcards). For
   * subdomain support, list each subdomain explicitly.
   */
  readonly allowedHosts: readonly string[];
  /** Hard cap on response body bytes returned to the agent. Default 65,536 (64KB). */
  readonly maxBodyBytes?: number;
  /** Per-request timeout. Default 5,000ms. */
  readonly timeoutMs?: number;
  /** Optional fetch impl override (used in tests). */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Reference loopback server: bounded HTTP GET / HEAD fetcher. Opt-in,
 * allowlist-required, body-capped. Lets Muse pull a public document or
 * health-check a known URL without giving it free network access.
 *
 * NOT included in `createDefaultLoopbackMcpServers` — operators who want
 * web fetch must construct it explicitly with the hosts they trust.
 */
export function createFetchMcpServer(options: FetchMcpServerOptions): LoopbackMcpServer {
  const allowedHosts = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  const maxBodyBytes = options.maxBodyBytes ?? 65_536;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  function checkAllowed(rawUrl: string): { readonly allowed: true; readonly url: URL } | { readonly allowed: false; readonly error: string } {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch (error) {
      return { allowed: false, error: `invalid URL: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { allowed: false, error: `unsupported protocol: ${parsed.protocol}` };
    }
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
      return { allowed: false, error: `host '${parsed.hostname}' is not in the configured allowlist` };
    }
    return { allowed: true, url: parsed };
  }

  async function callFetch(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url.toString(), { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  return {
    description: "Built-in HTTP GET/HEAD fetcher (loopback MCP, allowlist-bounded).",
    name: "muse.fetch",
    tools: [
      {
        description:
          "GETs the URL and returns { status, headers, body, truncated }. URL must be http/https and the hostname must be in the configured allowlist. Body is truncated at maxBodyBytes (default 64KB).",
        execute: async (args): Promise<JsonObject> => {
          const url = readString(args, "url");
          if (url === undefined) {
            return { error: "url is required" };
          }
          const decision = checkAllowed(url);
          if (!decision.allowed) {
            return { error: decision.error };
          }
          const headerEntries = readJsonObject(args, "headers");
          const requestHeaders: Record<string, string> = {};
          if (headerEntries) {
            for (const [key, value] of Object.entries(headerEntries)) {
              if (typeof value === "string") {
                requestHeaders[key] = value;
              }
            }
          }
          try {
            const response = await callFetch(decision.url, { headers: requestHeaders, method: "GET" });
            const fullBody = await response.text();
            const truncated = fullBody.length > maxBodyBytes;
            const body = truncated ? fullBody.slice(0, maxBodyBytes) : fullBody;
            return {
              body,
              headers: headersToObject(response.headers) as JsonValue,
              status: response.status,
              truncated
            } satisfies JsonObject;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { error: `fetch failed: ${message}` };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            headers: {
              additionalProperties: { type: "string" },
              type: "object"
            },
            url: { type: "string" }
          },
          required: ["url"],
          type: "object"
        },
        name: "get",
        risk: "read"
      },
      {
        description:
          "HEADs the URL and returns { status, headers }. Same allowlist + protocol contract as `get`. Useful for cheap reachability checks without pulling a body.",
        execute: async (args): Promise<JsonObject> => {
          const url = readString(args, "url");
          if (url === undefined) {
            return { error: "url is required" };
          }
          const decision = checkAllowed(url);
          if (!decision.allowed) {
            return { error: decision.error };
          }
          try {
            const response = await callFetch(decision.url, { method: "HEAD" });
            return {
              headers: headersToObject(response.headers) as JsonValue,
              status: response.status
            } satisfies JsonObject;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { error: `fetch failed: ${message}` };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: { url: { type: "string" } },
          required: ["url"],
          type: "object"
        },
        name: "head",
        risk: "read"
      }
    ]
  };
}
