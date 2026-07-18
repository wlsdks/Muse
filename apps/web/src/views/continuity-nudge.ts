/**
 * Pure derivations for Chat's session-open continuity nudge: which thread
 * (if any) to name, and the one-shot sessionStorage suppression so a
 * dismissed nudge does not reappear for the rest of the tab session. No
 * hooks, no fetch — testable without a render.
 */

import { firstResumableThread } from "./continuity-shared.js";

import type { ReviewThreadSummary } from "./continuity-shared.js";

export interface ReviewThreadsPayload {
  readonly threads?: readonly ReviewThreadSummary[];
}

export interface ContinuityNudge {
  readonly threadId: string;
  readonly title: string;
}

/**
 * The nudge names a thread ONLY when the review response actually reports
 * one whose Pack can be opened without a CLI hop (`firstResumableThread`) —
 * never a guessed "stale" thread the pack-open call would then reject. An
 * absent, empty, or all-external-source review yields no nudge, and the
 * caller renders nothing (fail-close, no error noise).
 */
export function continuityNudgeFor(review: ReviewThreadsPayload | undefined): ContinuityNudge | undefined {
  const thread = firstResumableThread(review?.threads);
  return thread ? { threadId: thread.id, title: thread.title } : undefined;
}

const SUPPRESSION_KEY = "muse.chatContinuityNudge.dismissedAt";

/** Storage reads/writes are wrapped: private-mode Safari and a full quota
 * both throw on `sessionStorage` access, and a missing nudge is a far safer
 * failure than a crashed Chat view. */
export function isNudgeDismissed(storage: Storage | undefined): boolean {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(SUPPRESSION_KEY) !== null;
  } catch {
    return false;
  }
}

export function dismissNudge(storage: Storage | undefined): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SUPPRESSION_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — dismissal just won't persist this session */
  }
}
