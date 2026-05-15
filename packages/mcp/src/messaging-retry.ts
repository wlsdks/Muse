/**
 * Shared retry-with-backoff for messaging dispatch (goal 149).
 *
 * Lifted out of `proactive-notice-loop.ts` (goal 070 + goal 148) so
 * `reminder-firing-loop.ts` can use the same transient-resilience
 * path: a 9am reminder shouldn't fail because Telegram returned a
 * one-off 503. Three attempts (0ms / 200ms / 800ms backoff) match
 * the proactive surface; permanent errors (401, 404,
 * INVALID_DESTINATION / INVALID_TEXT validation failures) short-
 * circuit on attempt 1 via `MessagingProviderError.retryable`
 * (goal 134) instead of burning the full ladder.
 *
 * Pure helper — `registry` is injected so tests fake the messenger
 * directly without env or real provider keys.
 */

import { MessagingProviderError, type MessagingProviderRegistry } from "@muse/messaging";

const BACKOFFS_MS: readonly number[] = [0, 200, 800];

export async function sendWithRetry(
  registry: MessagingProviderRegistry,
  providerId: string,
  message: { readonly destination: string; readonly text: string }
): Promise<void> {
  let lastError: unknown;
  for (const backoff of BACKOFFS_MS) {
    if (backoff > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, backoff));
    }
    try {
      await registry.send(providerId, message);
      return;
    } catch (cause) {
      lastError = cause;
      if (cause instanceof MessagingProviderError && !cause.retryable) {
        break;
      }
    }
  }
  throw lastError;
}
