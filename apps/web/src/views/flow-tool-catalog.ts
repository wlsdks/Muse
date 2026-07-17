/**
 * Pure filter over `GET /api/muse/loopback`'s catalog for the Builder's
 * tool-flow picker. A scheduled job runs UNATTENDED (no draft-first review
 * per firing), so offering a write/execute tool there is a human policy
 * decision, not something the Builder decides silently — v1 offers
 * `risk: "read"` tools ONLY (fail-closed default: a tool with no declared
 * risk, or any non-"read" risk, is excluded). See docs/goals/backlog.md for
 * the recorded open decision on write/execute scheduling + its approval UX.
 */

import type { LoopbackCatalogResponse } from "../api/types.js";

export interface ReadToolOption {
  readonly serverName: string;
  readonly serverDescription: string;
  readonly toolName: string;
  readonly toolDescription: string;
}

export function readRiskToolOptions(catalog: LoopbackCatalogResponse): readonly ReadToolOption[] {
  const options: ReadToolOption[] = [];
  for (const server of catalog.servers) {
    for (const tool of server.tools) {
      if (tool.risk === "read") {
        options.push({
          serverDescription: server.description,
          serverName: server.name,
          toolDescription: tool.description,
          toolName: tool.name
        });
      }
    }
  }
  return options;
}

export function uniqueServerNames(options: readonly ReadToolOption[]): readonly string[] {
  return [...new Set(options.map((option) => option.serverName))];
}

export function toolsForServer(options: readonly ReadToolOption[], serverName: string): readonly ReadToolOption[] {
  return options.filter((option) => option.serverName === serverName);
}
