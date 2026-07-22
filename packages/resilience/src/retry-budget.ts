export const DEFAULT_RUN_RETRY_MAX_RETRIES = 6;
export const MAX_RUN_RETRY_MAX_RETRIES = 32;
export const DEFAULT_RUN_RETRY_MAX_BACKOFF_MS = 30_000;
export const MAX_RUN_RETRY_MAX_BACKOFF_MS = 300_000;

export interface RetryBudgetPolicy {
  readonly maxBackoffMs?: number;
  readonly maxRetries?: number;
}

export interface RetryBudgetSnapshot {
  readonly maxBackoffMs: number;
  readonly maxRetries: number;
  readonly usedBackoffMs: number;
  readonly usedRetries: number;
}

export type RetryBudgetExhaustionReason = "backoff" | "retries";

export class RetryBudgetExhaustedError extends Error {
  readonly maxBackoffMs: number;
  readonly maxRetries: number;
  readonly reason: RetryBudgetExhaustionReason;
  readonly requestedBackoffMs: number;
  readonly usedBackoffMs: number;
  readonly usedRetries: number;

  constructor(reason: RetryBudgetExhaustionReason, snapshot: RetryBudgetSnapshot, requestedBackoffMs: number, cause: unknown) {
    super("Run retry budget exhausted", { cause });
    Object.defineProperty(this, "name", { configurable: true, value: "RetryBudgetExhaustedError" });
    this.reason = reason;
    this.maxBackoffMs = snapshot.maxBackoffMs;
    this.maxRetries = snapshot.maxRetries;
    this.requestedBackoffMs = requestedBackoffMs;
    this.usedBackoffMs = snapshot.usedBackoffMs;
    this.usedRetries = snapshot.usedRetries;
  }
}

export interface RetryReservation {
  cancel(): void;
  commit(): void;
}

export interface RetryBudget {
  reserve(input: { readonly backoffMs: number; readonly cause: unknown }): RetryReservation;
  snapshot(): RetryBudgetSnapshot;
}

function normalized(value: number | undefined, fallback: number, hardMax: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 && value <= hardMax ? value : fallback;
}

export function normalizeRetryBudgetPolicy(policy: RetryBudgetPolicy = {}): Required<RetryBudgetPolicy> {
  return {
    maxBackoffMs: normalized(policy.maxBackoffMs, DEFAULT_RUN_RETRY_MAX_BACKOFF_MS, MAX_RUN_RETRY_MAX_BACKOFF_MS),
    maxRetries: normalized(policy.maxRetries, DEFAULT_RUN_RETRY_MAX_RETRIES, MAX_RUN_RETRY_MAX_RETRIES)
  };
}

export function createRetryBudget(policy: RetryBudgetPolicy = {}): RetryBudget {
  const limits = normalizeRetryBudgetPolicy(policy);
  let usedBackoffMs = 0;
  let usedRetries = 0;

  const snapshot = (): RetryBudgetSnapshot => ({ ...limits, usedBackoffMs, usedRetries });

  return {
    reserve({ backoffMs, cause }) {
      const requestedBackoffMs = Number.isSafeInteger(backoffMs) && backoffMs >= 0 ? backoffMs : limits.maxBackoffMs + 1;
      const before = snapshot();
      if (usedRetries + 1 > limits.maxRetries) {
        throw new RetryBudgetExhaustedError("retries", before, requestedBackoffMs, cause);
      }
      if (usedBackoffMs + requestedBackoffMs > limits.maxBackoffMs) {
        throw new RetryBudgetExhaustedError("backoff", before, requestedBackoffMs, cause);
      }
      usedRetries += 1;
      usedBackoffMs += requestedBackoffMs;
      let state: "pending" | "committed" | "cancelled" = "pending";
      return {
        cancel() {
          if (state !== "pending") return;
          state = "cancelled";
          usedRetries -= 1;
          usedBackoffMs -= requestedBackoffMs;
        },
        commit() {
          if (state !== "pending") return;
          state = "committed";
        }
      };
    },
    snapshot
  };
}
