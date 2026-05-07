import type { AgentSpecResolution } from "@muse/agent-specs";
import type { ModelMessage, ModelToolCall } from "@muse/model";
import type { AgentRunMode } from "@muse/runtime-state";
import type { JsonObject } from "@muse/shared";
import { ModelRoutingError } from "./errors.js";
import { isRecord } from "./internals.js";
import type { AgentSpecRunReport } from "./types.js";

/**
 * Small input-shaping and metadata helpers shared across the AgentRuntime
 * methods.
 *
 * Kept in their own module so the runtime monolith does not have to inline
 * dozens of one-liners. Each helper is pure (no shared state) and consumers
 * outside agent-core should not import from here — the entry-point types
 * are re-exported from `index.ts`.
 */

export function applyAgentSpecSystemPrompt(
  messages: readonly ModelMessage[],
  resolution: AgentSpecResolution
): readonly ModelMessage[] {
  const systemPrompt = resolution.spec.systemPrompt;

  if (!systemPrompt) {
    return messages;
  }

  const [first, ...rest] = messages;

  if (first?.role === "system") {
    return [
      {
        ...first,
        content: `${systemPrompt}\n\n${first.content}`
      },
      ...rest
    ];
  }

  return [{ content: systemPrompt, role: "system" }, ...messages];
}

export function toAgentSpecRunReport(resolution: AgentSpecResolution): AgentSpecRunReport {
  return {
    confidence: resolution.confidence,
    matchedKeywords: [...resolution.matchedKeywords],
    name: resolution.spec.name,
    toolNames: [...resolution.spec.toolNames]
  };
}

export function metadataString(metadata: JsonObject | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

export function latestUserPrompt(messages: readonly ModelMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "user") {
      return message.content;
    }
  }

  return "";
}

export function stringListMetadata(value: unknown): readonly string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }

  return undefined;
}

export function numberMetadata(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isModelMessage(value: unknown): value is ModelMessage {
  if (!isRecord(value) || typeof value.content !== "string") {
    return false;
  }

  return value.role === "system" || value.role === "user" || value.role === "assistant" || value.role === "tool";
}

export function ragFilters(metadata: JsonObject | undefined): JsonObject | undefined {
  const filters: Record<string, string> = {};

  for (const key of ["tenantId", "workspaceId"] as const) {
    const value = metadata?.[key];

    if (typeof value === "string" && value.trim().length > 0) {
      filters[key] = value;
    }
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
}

export function toolCallsMetadata(toolCalls: readonly ModelToolCall[]): JsonObject {
  return {
    toolCallCount: toolCalls.length,
    toolCallIds: toolCalls.map((toolCall) => toolCall.id),
    toolCallNames: toolCalls.map((toolCall) => toolCall.name)
  };
}

export function toAgentRunMode(mode: AgentRunMode | undefined): AgentRunMode {
  return mode ?? "react";
}

export function failMissingProvider(): never {
  throw new ModelRoutingError("AgentRuntime model provider is unavailable");
}
