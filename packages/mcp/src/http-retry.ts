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
  /**
   * Per-attempt wall-clock cap in ms. A host that accepts the
   * connection but never responds (a service mid-restart, a black-hole
   * proxy) makes a bare `fetch` hang forever — no status, no reject, so
   * the retry logic never engages and the whole turn freezes. Each
   * attempt is aborted after this window and treated as a transient
   * failure (retried; the final attempt's timeout error propagates).
   * Default 15000. `0` disables the cap.
   */
  readonly timeoutMs?: number;
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
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs as number) : 15_000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = timeoutMs > 0 ? new AbortController() : undefined;
    const externalSignal = options.init?.signal ?? undefined;
    let onExternalAbort: (() => void) | undefined;
    if (controller && externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        onExternalAbort = () => controller.abort(externalSignal.reason);
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }
    const timer = controller
      ? setTimeout(() => controller.abort(new Error(`fetchWithRetry: attempt timed out after ${timeoutMs.toString()}ms`)), timeoutMs)
      : undefined;
    try {
      const init = controller ? { ...(options.init ?? {}), signal: controller.signal } : options.init;
      const response = init === undefined ? await fetchImpl(url) : await fetchImpl(url, init);
      if (response.ok || !isRetriableStatus(response.status) || attempt === retries) {
        return response;
      }
    } catch (cause) {
      lastError = cause;
      if (attempt === retries) {
        throw cause;
      }
    } finally {
      if (timer) clearTimeout(timer);
      if (externalSignal && onExternalAbort) externalSignal.removeEventListener("abort", onExternalAbort);
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
  throw lastError ?? new Error("fetchWithRetry: retries exhausted");
}
