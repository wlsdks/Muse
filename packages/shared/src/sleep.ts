import { setTimeout as delay } from "node:timers/promises";

/**
 * Shared async delay primitive.
 *
 * Keeps all timer injection points behaviorally consistent and lets callers
 * provide custom backoffs in tests without touching production timing.
 */
export function sleep(ms: number): Promise<void> {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.trunc(ms)) : 0;
  return delay<void>(safeMs);
}

/**
 * Race an async operation against a wall-clock timeout.
 *
 * The timeout branch is explicit and typed (callback-based), so callers can
 * return a fallback value, throw a domain error, or run a cleanup callback
 * without depending on throw-in-chain anti-patterns.
 */
export async function withTimeout<T, F = never>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<F> | F
): Promise<T | F> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation;
  }
  const timedOut = (async () => {
    await sleep(timeoutMs);
    return onTimeout();
  })();
  return Promise.race([operation, timedOut]);
}

/**
 * A one-line variant for callers that want to fallback to `undefined` on timeout.
 */
export async function withTimeoutFallback<T>(operation: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return withTimeout(operation, timeoutMs, () => undefined);
}
