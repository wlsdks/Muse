/**
 * `muse.context` loopback MCP server — agent-callable surface over
 * the `ContextReferenceStore` (Context Engineering 1.d, round 167).
 *
 * Tools:
 *   - `muse.context.fetch({ ref })` — return the full content
 *     stashed under `ref`. The marker emitted by tool-output
 *     truncation (round 161) is the typical `ref` source. Returns
 *     `{ found: false }` when the ref is unknown / expired.
 *   - `muse.context.list()` — enumerate currently-cached refs with
 *     their source tool, `originalLength`, and `createdAt`. Useful
 *     for the agent (or a debugger UI) to see what's available
 *     without fetching every blob.
 *
 * The store is in-process: refs survive only within the same
 * server. Cross-process sharing is intentionally out of scope —
 * the references are an inference-time scratchpad, not a
 * persistent cache.
 */

import type { JsonObject, JsonValue } from "@muse/shared";

import { readString } from "./loopback-helpers.js";
import type { LoopbackMcpServer } from "./loopback.js";
import type { ContextReferenceStore } from "@muse/memory";

export interface ContextReferenceMcpServerOptions {
  readonly store: ContextReferenceStore;
}

export function createContextReferenceMcpServer(
  options: ContextReferenceMcpServerOptions
): LoopbackMcpServer {
  const { store } = options;

  return {
    description: "Server-side reference cache for large tool outputs (Context Engineering 1.d).",
    name: "muse.context",
    tools: [
      {
        description:
          "Fetch the full content stashed under a reference id. " +
          "When tool output is truncated, its marker includes a `ref=<id>` hint — pass that id here to expand.",
        execute: async (args): Promise<JsonObject> => {
          const ref = readString(args, "ref")?.trim();
          if (!ref) {
            return { error: "ref is required" };
          }
          const entry = store.get(ref);
          if (!entry) {
            return { found: false, ref };
          }
          return {
            content: entry.content,
            ...(entry.contentType ? { contentType: entry.contentType } : {}),
            createdAt: entry.createdAt.toISOString(),
            found: true,
            ref: entry.id,
            ...(entry.source ? { source: entry.source } : {}),
            ...(typeof entry.originalLength === "number" ? { originalLength: entry.originalLength } : {})
          };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            ref: { type: "string" }
          },
          required: ["ref"],
          type: "object"
        },
        name: "fetch",
        risk: "read"
      },
      {
        description:
          "List currently-cached reference ids without fetching their bodies. " +
          "Useful before deciding which `fetch(ref)` is worth the budget.",
        execute: async (): Promise<JsonObject> => {
          const refs = store.list().map((entry) => ({
            createdAt: entry.createdAt.toISOString(),
            id: entry.id,
            ...(entry.contentType ? { contentType: entry.contentType } : {}),
            ...(typeof entry.originalLength === "number" ? { originalLength: entry.originalLength } : {}),
            ...(entry.source ? { source: entry.source } : {})
          }));
          return {
            refs: refs as JsonValue,
            total: refs.length
          };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {},
          type: "object"
        },
        name: "list",
        risk: "read"
      }
    ]
  };
}
