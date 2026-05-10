import type { JsonObject, JsonValue } from "@muse/shared";

import { readString } from "./loopback-helpers.js";
import type { LoopbackMcpServer } from "./loopback.js";

/**
 * `muse.url` URL parsing + query encoding. Lifted out of
 * `loopback.ts`.
 */

export function createUrlMcpServer(): LoopbackMcpServer {
  return {
    description: "Built-in URL parsing utilities (loopback MCP).",
    name: "muse.url",
    tools: [
      {
        description: "Parses a URL into its components (scheme, host, port, path, query map, hash).",
        execute: (args): JsonObject => {
          const url = readString(args, "url");
          if (url === undefined || url.length === 0) {
            return { error: "url is required" };
          }
          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch (error) {
            return { error: `invalid URL: ${error instanceof Error ? error.message : String(error)}` };
          }
          const query: Record<string, string | string[]> = {};
          for (const [key, value] of parsed.searchParams.entries()) {
            const existing = query[key];
            if (existing === undefined) {
              query[key] = value;
            } else if (Array.isArray(existing)) {
              existing.push(value);
            } else {
              query[key] = [existing, value];
            }
          }
          return {
            hash: parsed.hash,
            host: parsed.host,
            hostname: parsed.hostname,
            origin: parsed.origin,
            password: parsed.password,
            pathname: parsed.pathname,
            port: parsed.port,
            protocol: parsed.protocol,
            query: query as JsonValue,
            search: parsed.search,
            username: parsed.username
          } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: { url: { type: "string" } },
          required: ["url"],
          type: "object"
        },
        name: "parse",
        risk: "read"
      },
      {
        description: "Encodes a key/value object as an application/x-www-form-urlencoded query string.",
        execute: (args): JsonObject => {
          const params = args.params;
          if (!params || typeof params !== "object" || Array.isArray(params)) {
            return { error: "params must be a JSON object" };
          }
          const search = new URLSearchParams();
          for (const [key, raw] of Object.entries(params as Record<string, unknown>)) {
            if (Array.isArray(raw)) {
              for (const item of raw) {
                search.append(key, String(item));
              }
            } else if (raw !== undefined && raw !== null) {
              search.append(key, String(raw));
            }
          }
          return { query: search.toString() } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: { params: { type: "object" } },
          required: ["params"],
          type: "object"
        },
        name: "encode_query",
        risk: "read"
      }
    ]
  };
}
