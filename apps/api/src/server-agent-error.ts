import {
  GuardBlockedError,
  OutputGuardBlockedError,
  PlanExecutionError,
  PlanValidationFailedError
} from "@muse/agent-core";

import type { ApiError } from "./server-helpers.js";

export function sendAgentError(
  reply: { status(statusCode: number): { send(payload: ApiError): void } },
  error: unknown,
  responseMode: "extended" | "compat"
) {
  if (error instanceof GuardBlockedError) {
    return reply.status(403).send(chatErrorResponse({
      blockReason: error.message,
      code: error.code ?? "GUARD_BLOCKED",
      errorCode: error.code ?? "GUARD_BLOCKED",
      errorMessage: error.message,
      message: error.message
    }, responseMode) as ApiError);
  }

  if (error instanceof OutputGuardBlockedError) {
    return reply.status(422).send(chatErrorResponse({
      blockReason: error.message,
      code: error.code ?? "OUTPUT_GUARD_BLOCKED",
      errorCode: error.code ?? "OUTPUT_GUARD_BLOCKED",
      errorMessage: error.message,
      message: error.message
    }, responseMode) as ApiError);
  }

  if (error instanceof PlanExecutionError) {
    return reply.status(422).send(chatErrorResponse({
      code: error.code,
      errorCode: error.code,
      errorMessage: error.message,
      message: error.message
    }, responseMode) as ApiError);
  }

  if (error instanceof PlanValidationFailedError) {
    return reply.status(422).send(chatErrorResponse({
      code: "PLAN_VALIDATION_FAILED",
      errorCode: "PLAN_VALIDATION_FAILED",
      errorMessage: error.message,
      message: error.message
    }, responseMode) as ApiError);
  }

  const message = unwrapErrorMessage(error);
  return reply.status(500).send(chatErrorResponse({
    code: "AGENT_RUN_FAILED",
    errorCode: "AGENT_RUN_FAILED",
    errorMessage: message,
    message
  }, responseMode) as ApiError);
}

/**
 * Unwrap nested error causes (RetryExhaustedError → ModelProviderError →
 * underlying fetch error) so an operator sees the actual upstream error
 * message instead of the generic retry-exhausted wrapper.
 */
export function unwrapErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Agent run failed";
  }

  const seen = new Set<unknown>();
  const segments: string[] = [];
  let current: unknown = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    segments.push(current.message);
    current = (current as Error & { readonly cause?: unknown }).cause;
  }

  return segments.join(" — ");
}

function chatErrorResponse(
  error: {
    readonly blockReason?: string;
    readonly code: string;
    readonly errorCode: string;
    readonly errorMessage: string;
    readonly message: string;
  },
  responseMode: "extended" | "compat"
) {
  const response = {
    blockReason: error.blockReason ?? null,
    content: null,
    durationMs: null,
    errorCode: error.errorCode,
    errorMessage: error.errorMessage,
    grounded: null,
    metadata: {},
    model: null,
    success: false,
    tokenUsage: null,
    toolsUsed: [],
    verifiedSourceCount: null
  };

  return responseMode === "compat"
    ? response
    : {
      ...response,
      code: error.code,
      message: error.message
    };
}
