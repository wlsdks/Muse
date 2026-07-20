/**
 * Request-body parsing for the multi-agent orchestrate route, plus the
 * error/result envelopes the route layer speaks. A LEAF — the route module
 * imports these; nothing here imports back from multi-agent-routes.js.
 */

import type { JsonObject } from "@muse/shared";
import type { AgentMessage, OrchestrationMode } from "@muse/multi-agent";

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export interface OrchestrateBody {
  readonly message: string;
  readonly model?: string;
  readonly mode?: OrchestrationMode;
  readonly workerIds?: readonly string[];
  readonly maxWorkers?: number;
  readonly maxOutputCharsPerWorker?: number;
  readonly summarize?: boolean;
  readonly synthesize?: boolean;
  readonly verify?: boolean;
  readonly tiered?: boolean;
  /**
   * Dispatch the sub-agents without waiting for them — the handler returns
   * `202` with `{ orchestrationId, subtaskCount }` immediately instead of
   * blocking on the full fan-out. The consolidated result lands in
   * `historyStore` (same shape as the blocking path) the moment the last
   * worker settles; poll `GET /api/multi-agent/orchestrations/:runId`.
   */
  readonly background?: boolean;
}

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };

export function parseOrchestrateBody(value: unknown): ParseResult<OrchestrateBody> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "Body must be a JSON object");
  }

  const body = value as Record<string, unknown>;

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "message is required");
  }

  let mode: OrchestrationMode | undefined;

  if (body.mode === "sequential" || body.mode === "parallel" || body.mode === "race") {
    mode = body.mode;
  } else if (body.mode !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "mode must be 'sequential', 'parallel', or 'race'");
  }

  let workerIds: readonly string[] | undefined;

  if (Array.isArray(body.workerIds)) {
    if (!body.workerIds.every((id) => typeof id === "string")) {
      return invalid("INVALID_ORCHESTRATE_REQUEST", "workerIds must be string[]");
    }

    workerIds = body.workerIds as readonly string[];
  } else if (body.workerIds !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "workerIds must be string[]");
  }

  let maxWorkers: number | undefined;

  if (typeof body.maxWorkers === "number" && Number.isFinite(body.maxWorkers) && body.maxWorkers > 0) {
    maxWorkers = body.maxWorkers;
  } else if (body.maxWorkers !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "maxWorkers must be a positive number");
  }

  let maxOutputCharsPerWorker: number | undefined;

  if (typeof body.maxOutputCharsPerWorker === "number"
    && Number.isFinite(body.maxOutputCharsPerWorker)
    && body.maxOutputCharsPerWorker >= 0) {
    maxOutputCharsPerWorker = body.maxOutputCharsPerWorker;
  } else if (body.maxOutputCharsPerWorker !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "maxOutputCharsPerWorker must be a non-negative number");
  }

  let summarize: boolean | undefined;
  if (typeof body.summarize === "boolean") {
    summarize = body.summarize;
  } else if (body.summarize !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "summarize must be a boolean");
  }

  let synthesize: boolean | undefined;
  if (typeof body.synthesize === "boolean") {
    synthesize = body.synthesize;
  } else if (body.synthesize !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "synthesize must be a boolean");
  }

  let verify: boolean | undefined;
  if (typeof body.verify === "boolean") {
    verify = body.verify;
  } else if (body.verify !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "verify must be a boolean");
  }

  let tiered: boolean | undefined;
  if (typeof body.tiered === "boolean") {
    tiered = body.tiered;
  } else if (body.tiered !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "tiered must be a boolean");
  }

  let background: boolean | undefined;
  if (typeof body.background === "boolean") {
    background = body.background;
  } else if (body.background !== undefined) {
    return invalid("INVALID_ORCHESTRATE_REQUEST", "background must be a boolean");
  }

  return {
    ok: true,
    value: {
      message: body.message,
      ...(typeof body.model === "string" && body.model.trim().length > 0 ? { model: body.model } : {}),
      ...(mode ? { mode } : {}),
      ...(workerIds ? { workerIds } : {}),
      ...(maxWorkers !== undefined ? { maxWorkers } : {}),
      ...(maxOutputCharsPerWorker !== undefined ? { maxOutputCharsPerWorker } : {}),
      ...(summarize !== undefined ? { summarize } : {}),
      ...(synthesize !== undefined ? { synthesize } : {}),
      ...(verify !== undefined ? { verify } : {}),
      ...(tiered !== undefined ? { tiered } : {}),
      ...(background !== undefined ? { background } : {})
    }
  };
}

function invalid(code: string, message: string): ParseResult<never> {
  return { error: { code, message }, ok: false };
}

export interface ConversationEntry {
  readonly content: string;
  readonly sourceAgentId: string;
  readonly targetAgentId?: string;
  readonly metadata?: JsonObject;
  readonly timestamp: string;
}

export function toConversationEntry(message: AgentMessage): ConversationEntry {
  const metadata = message.metadata
    ? (Object.fromEntries(
        Object.entries(message.metadata).filter(([, value]) => value !== undefined)
      ) as JsonObject)
    : undefined;

  return {
    content: message.content,
    sourceAgentId: message.sourceAgentId,
    timestamp: message.timestamp.toISOString(),
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(message.targetAgentId !== undefined ? { targetAgentId: message.targetAgentId } : {})
  };
}
