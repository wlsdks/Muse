import type { ActionLogEntry } from "@muse/stores";

/**
 * Approval-rate telemetry — measuring whether a draft-first approval gate
 * (`outbound-safety.md` rule 2) is still doing its job or has become a
 * rubber stamp. Anthropic measured that users approve ~93% of Claude's
 * permission prompts and grow LESS diligent the more they see ("How we
 * contain Claude": https://www.anthropic.com/engineering/how-we-contain-claude).
 * A gate that is always approved buys no safety and pays a real UX cost — the
 * fix the same writeup describes is not more prompts, it's converting the
 * reflexively-approved classes into pre-approved safe boundaries (they cut
 * dialogs 84% that way). This module only MEASURES and REPORTS; it never
 * changes gate behaviour — that is a separate, human-approved decision.
 *
 * Grouped by `ActionLogEntry.gateClass` — the registered tool/gate id each
 * interactive approval-gate call site stamps on its own outcome (`web_action`,
 * `email_send`, `muse.messaging.send`, …) AND the channel-approval-gate's own
 * refusal recorder stamps with the SAME literal tool name, so a prompt that
 * was refused before the tool's own gate ever ran (a channel-level timeout /
 * fail-closed refusal) still joins the right bucket instead of undercounting
 * that class's denials.
 *
 * Deliberately EXCLUDED: `performConsentedAction` / the standing-objective
 * consent-veto check and any autonomous-perform-only path (undo, the
 * objective evaluator's own delivery log). Those never show a human a live
 * approval prompt at call time — they replay a consent recorded earlier —
 * so folding their outcomes in here would misrepresent "prompt fatigue" with
 * a check that was never a prompt.
 */

/**
 * A gate whose observed approval rate is AT or ABOVE this line is being
 * reflexively approved, not meaningfully exercised — the exact rate Anthropic
 * measured users approving Claude's permission prompts at. Cited above.
 */
export const RUBBER_STAMP_APPROVAL_RATE_THRESHOLD = 0.93;

/**
 * Minimum number of live approve/deny decisions before a gate's approval rate
 * is treated as evidence at all. A 2/2 (or even 18/20) approved run is
 * indistinguishable from noise — this is a DELIBERATELY conservative floor
 * (favouring a missed rubber-stamp over a false one): at 20 decisions, a gate
 * that in truth denies 1 time in 20 (95% true approval — already below the
 * 93% threshold) still has a ~36% chance of showing zero denials by chance
 * (0.95^20 ≈ 0.36), so 20 is not a statistical proof — it is the point below
 * which flagging a class would be reporting noise as a finding, and doctor's
 * text is honest about the sample size alongside the rate.
 */
export const RUBBER_STAMP_MIN_SAMPLE_SIZE = 20;

export interface ApprovalGateStats {
  readonly gateClass: string;
  /** Live approve/deny decisions this class has recorded (approved + denied; excludes execution-only failures). */
  readonly prompted: number;
  /** Approved by the human — includes a `failed` outcome (approved, but the subsequent send/HTTP call itself errored). */
  readonly approved: number;
  /** Denied at the gate (a `refused` outcome, from the tool's own gate OR the channel gate). */
  readonly denied: number;
  /** Of the approved decisions, how many then failed to execute (network/HTTP error) — reported for transparency, excluded from the rate. */
  readonly executionFailed: number;
  /** `approved / prompted`. `0` when `prompted` is `0`. */
  readonly approvalRate: number;
  /** `true` only when `prompted >= RUBBER_STAMP_MIN_SAMPLE_SIZE` AND `approvalRate >= RUBBER_STAMP_APPROVAL_RATE_THRESHOLD`. */
  readonly rubberStamped: boolean;
}

export interface ApprovalRateSummary {
  /** Busiest gate class first. */
  readonly gates: readonly ApprovalGateStats[];
  readonly rubberStampedClasses: readonly string[];
}

interface GateClassTally {
  approved: number;
  denied: number;
  failed: number;
}

/**
 * Pure aggregator over action-log entries. Entries with no `gateClass` (a
 * legacy entry predating this field, or a deliberately-excluded
 * non-interactive path) are skipped — they carry no gate identity to group
 * by, and folding them into an "unclassified" bucket would mix classes with
 * genuinely different risk profiles into one meaningless number.
 */
export function analyzeApprovalRates(
  entries: readonly Pick<ActionLogEntry, "gateClass" | "result">[]
): ApprovalRateSummary {
  const byClass = new Map<string, GateClassTally>();
  for (const entry of entries) {
    const gateClass = entry.gateClass;
    if (!gateClass) {
      continue;
    }
    const tally = byClass.get(gateClass) ?? { approved: 0, denied: 0, failed: 0 };
    if (entry.result === "performed") {
      tally.approved += 1;
    } else if (entry.result === "refused") {
      tally.denied += 1;
    } else if (entry.result === "failed") {
      // The human approved; the subsequent send/HTTP call itself errored.
      // That is an execution failure, not a gate denial — still counts
      // toward "approved" for the approval-RATE, tracked separately too.
      tally.approved += 1;
      tally.failed += 1;
    }
    byClass.set(gateClass, tally);
  }

  const gates: ApprovalGateStats[] = [...byClass.entries()]
    .map(([gateClass, tally]): ApprovalGateStats => {
      const prompted = tally.approved + tally.denied;
      const approvalRate = prompted > 0 ? tally.approved / prompted : 0;
      const rubberStamped = prompted >= RUBBER_STAMP_MIN_SAMPLE_SIZE && approvalRate >= RUBBER_STAMP_APPROVAL_RATE_THRESHOLD;
      return {
        approvalRate,
        approved: tally.approved,
        denied: tally.denied,
        executionFailed: tally.failed,
        gateClass,
        prompted,
        rubberStamped
      };
    })
    .sort((a, b) => b.prompted - a.prompted || a.gateClass.localeCompare(b.gateClass));

  return {
    gates,
    rubberStampedClasses: gates.filter((g) => g.rubberStamped).map((g) => g.gateClass)
  };
}
