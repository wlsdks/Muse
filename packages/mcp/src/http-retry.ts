/**
 * Shared HTTP retry-with-backoff for read-only / idempotent actuator
 * fetches (weather lookups, inbox reads). State-changing sends must
 * NOT use this — a retried POST can double-act.
 */

export interface RetryOptions {
  /** Extra attempts after the first. Default 2 (so up to 3 calls). */
  readonly retries?: number;
  /** First backoff in ms; doubles each retry. Default 250. */
  readonly baseDelayMs?: number;
  /** Injectable delay so tests don't wait on real timers. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Passed through to `fetchImpl(url, init)` (e.g. auth headers). */
  readonly init?: RequestInit;
}

/**
 * Transient HTTP failures worth retrying: 429 (rate-limit) and any
 * 5xx. A 4xx other than 429 is a permanent client error — retrying it
 * just wastes the window, so fail fast.
 */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * `fetch` with retry-with-backoff for transient failures (429 / 5xx /
 * network reject). Permanent responses (2xx, or a non-429 4xx) return
 * immediately; the last attempt's response/error is handed back so the
 * caller's own status handling still runs.
 */
export async function fetchWithRetry(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  options: RetryOptions = {}
): Promise<Response> {
  const retries = Number.isFinite(options.retries) ? Math.max(0, Math.trunc(options.retries as number)) : 2;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) ? Math.max(0, options.baseDelayMs as number) : 250;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = options.init === undefined ? await fetchImpl(url) : await fetchImpl(url, options.init);
      if (response.ok || !isRetriableStatus(response.status) || attempt === retries) {
        return response;
      }
    } catch (cause) {
      lastError = cause;
      if (attempt === retries) {
        throw cause;
      }
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
  throw lastError ?? new Error("fetchWithRetry: retries exhausted");
}
