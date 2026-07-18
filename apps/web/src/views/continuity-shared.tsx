/**
 * Shared Continuity Pack helpers reused by both the full review tab
 * (`ContinuityReview.tsx`) and the two app-surface wedges — Home's inline
 * expand and Chat's session-open nudge. Kept as a separate module so
 * neither surface duplicates the outcome-recording or resumability logic
 * ContinuityReview already owns.
 */

import { Button } from "../components/ui.js";
import { OUTCOMES } from "./ContinuityReview.js";

import type { Outcome } from "./ContinuityReview.js";
import type { Translate } from "../i18n/index.js";

export type { Kind, OpenedPack, Outcome } from "./ContinuityReview.js";
export { OUTCOMES };

export interface ReviewThreadLink {
  readonly artifactId: string;
  readonly artifactType: string;
  readonly providerId: string;
  readonly role: string;
}

export interface ReviewThreadSummary {
  readonly id: string;
  readonly kind: "life" | "work";
  readonly linkCount: number;
  readonly links: readonly ReviewThreadLink[];
  readonly title: string;
}

/**
 * A thread's Pack can be opened directly — no CLI hop required — only when
 * it carries at least one linked source and every one of those sources is
 * local. This mirrors ContinuityReview's `hasExternalSource` gate on its
 * "Open pack" button: an external source needs the CLI's live MCP check, so
 * neither Home's inline expand nor Chat's nudge may call `continue` for it.
 */
export function isThreadResumable(thread: Pick<ReviewThreadSummary, "linkCount" | "links">): boolean {
  return thread.linkCount > 0 && thread.links.every((link) => link.providerId === "local");
}

/** The first thread (in server order) whose Pack can actually be opened. */
export function firstResumableThread<T extends Pick<ReviewThreadSummary, "linkCount" | "links">>(
  threads: readonly T[] | undefined
): T | undefined {
  return threads?.find(isThreadResumable);
}

/** The "how did this help" outcome row — identical markup to
 * ContinuityReview's `PendingReviewCard` control, extracted so a new
 * surface never re-derives the aria-label / button set by hand. */
export function OutcomeButtons({
  deliveryId,
  disabled,
  onOutcome,
  t
}: {
  readonly deliveryId: string;
  readonly disabled: boolean;
  readonly onOutcome: (value: Outcome) => void;
  readonly t: Translate;
}) {
  return (
    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6 }}>
      <span className="row-meta">{t("continuity.recordOutcome")}</span>
      {OUTCOMES.map((value) => (
        <Button
          ariaLabel={t("continuity.recordOutcomeFor", { id: deliveryId, outcome: value })}
          disabled={disabled}
          key={value}
          size="sm"
          variant="ghost"
          onClick={() => onOutcome(value)}
        >
          {value}
        </Button>
      ))}
    </div>
  );
}
