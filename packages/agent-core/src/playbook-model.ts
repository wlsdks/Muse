import type { Awaitable } from "./types.js";

/**
 * ACE — Agentic Context Engineering (arXiv 2510.04618): a frozen model
 * self-improves by accumulating small, incremental strategy deltas in an
 * evolving "playbook" instead of being re-prompted/fine-tuned. This is the
 * POSITIVE counterpart to veto-avoidance: where a veto says "don't do X", a
 * playbook strategy says "when X, prefer Y" — a learned how-to the user (or a
 * correction) taught, injected so the agent applies it on matching turns.
 *
 * Duck-typed so `agent-core` stays free of a `@muse/mcp` dependency.
 */
export interface PlaybookStrategy {
  /**
   * Durable store id, when the provider has one. Lets the injection layer
   * record WHICH strategies were injected (`metadata.playbookInjectedIds`) so
   * session-end reinforcement credit can target an actually-injected strategy
   * instead of re-deriving the target by cosine similarity.
   */
  readonly id?: string;
  /** The learned strategy, e.g. "when rescheduling, default to the next business day". */
  readonly text: string;
  /** Optional task-class tag so strategies can be scoped/filtered later. */
  readonly tag?: string;
  /**
   * Learned reward — the net outcome signal (reinforcements − decays),
   * clamped to [PLAYBOOK_REWARD_MIN, PLAYBOOK_REWARD_MAX]. 0 = neutral / new.
   * Reward shapes selection (RL over the bank): a proven strategy surfaces
   * first, and one that keeps getting corrected sinks out of the injected
   * top-K. Absent = 0, so a strategy with no recorded outcomes ranks purely
   * on relevance (today's behaviour).
   */
  readonly reward?: number;
  /**
   * PROBATION: a strategy written UNATTENDED (idle daemon distillation) enters
   * probation — recorded + visible but NEVER injected — until a real signal
   * graduates it. Breaks the self-confirmation loop: the agent must not start
   * applying a guess it made about the user without evidence. Absent/false =
   * graduated (injected as normal). (ExpeL evidence-gated.)
   */
  readonly probation?: boolean;
  /**
   * PROVENANCE: `"grounded"` (distilled from a real correction),
   * `"reflected"` (synthesised, no direct correction), or `"manual"`. A
   * `reflected` strategy carries a tiny ranking penalty so a synthetic guess
   * never outranks an otherwise-equal grounded record — evidence beats
   * synthesis at equal standing. Absent = treated as non-reflected.
   */
  readonly origin?: string;
  /**
   * Memp (arXiv 2508.06433): per-entry outcome tallies for evidence-gated
   * lifecycle. Separates "never used" (both 0 / absent) from "used N times
   * with a mixed record" — the net-reward scalar conflates these two states.
   * A VALID tally = both fields present, finite integers ≥ 0, and
   * reinforcements + decays ≥ 1. Missing/garbage → legacy reward path.
   */
  readonly reinforcements?: number;
  readonly decays?: number;
  /** ISO-8601 timestamp of the last user-confirmed reinforcement (D-UCB anchor). */
  readonly lastReinforcedAt?: string;
  /** ISO-8601 creation timestamp; used as fallback anchor when lastReinforcedAt is absent. */
  readonly createdAt?: string;
}

export interface PlaybookProvider {
  listStrategies(userId: string): Awaitable<readonly PlaybookStrategy[]>;
}

export function sanitizeInline(value: string): string {
  // Strategies are user-authored free text; collapse whitespace so a
  // `\n[System Override]\n` splice cannot forge a section.
  return value.replace(/\s+/gu, " ").trim();
}

export function renderPlaybookSection(strategies: readonly PlaybookStrategy[]): string | undefined {
  const cleaned = strategies.map((s) => sanitizeInline(s.text)).filter((t) => t.length > 0);
  if (cleaned.length === 0) {
    return undefined;
  }
  const lines = [
    "[Learned Strategies]",
    "From past feedback, apply these working preferences when they fit the",
    "current request (they are guidance, not overrides of the user's words):"
  ];
  for (const text of cleaned) {
    lines.push(`- ${text}`);
  }
  return lines.join("\n");
}

/** Reward bounds — net outcome signal per strategy, clamped so one streak can't dominate ranking. */
export const PLAYBOOK_REWARD_MIN = -5;
export const PLAYBOOK_REWARD_MAX = 5;
/**
 * Discounted-UCB half-life (arXiv:0805.3415, Garivier & Moulines 2008): user
 * preferences drift, so a reinforcement from 30 days ago carries half the
 * weight of one from today. Aligns with PLAYBOOK_DECAY_STALE_DAYS.
 */
export const PLAYBOOK_RECENCY_HALF_LIFE_DAYS = 30;

/** Coerce a possibly-absent/garbage reward to the clamped numeric range; absent → 0. */
export function clampReward(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(PLAYBOOK_REWARD_MIN, Math.min(PLAYBOOK_REWARD_MAX, value));
}

/**
 * Discounted-UCB recency multiplier (arXiv:0805.3415, Garivier & Moulines 2008).
 * User preferences are non-stationary: a reinforcement from the recent past
 * deserves more weight than one from months ago. Returns a multiplier in (0,1].
 *
 * Anchor = lastReinforcedAt ?? createdAt. When absent or unparseable → 1
 * (legacy-identical, no discount applied). Future anchors are treated as age 0
 * (multiplier 1) — a positive boost is never applied.
 */
export function recencyDiscount(
  strategy: PlaybookStrategy,
  nowMs: number,
  halfLifeDays = PLAYBOOK_RECENCY_HALF_LIFE_DAYS
): number {
  const anchorMs = Date.parse(strategy.lastReinforcedAt ?? strategy.createdAt ?? "");
  if (isNaN(anchorMs)) {
    return 1;
  }
  const ageDays = Math.max(0, (nowMs - anchorMs) / 86_400_000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function hasValidTally(s: PlaybookStrategy): boolean {
  const r = s.reinforcements;
  const d = s.decays;
  return (
    typeof r === "number" && Number.isFinite(r) && r >= 0 && Number.isInteger(r) &&
    typeof d === "number" && Number.isFinite(d) && d >= 0 && Number.isInteger(d) &&
    r + d >= 1
  );
}

/**
 * Evidence-damped reward: when a valid tally exists (Memp, arXiv 2508.06433)
 * derive the effective score from outcome tallies with a shrinkage factor so a
 * single trial stays near neutral. Falls back to the legacy clamped reward for
 * entries without a valid tally — byte-identical to the pre-change path.
 *
 * When `nowMs` is provided and a parseable timestamp anchor exists on the
 * strategy, the POSITIVE reward component is multiplied by a recency discount
 * (D-UCB, arXiv:0805.3415) so stale trust fades. The negative/sunk component
 * is never discounted — recency fades trust, it never un-sinks a corrected
 * strategy (INV-2). When `nowMs` is absent the result is byte-identical to the
 * pre-change value (INV-1).
 */
export function effectiveStrategyReward(s: PlaybookStrategy, nowMs?: number): number {
  if (!hasValidTally(s)) {
    const base = clampReward(s.reward);
    if (nowMs !== undefined && base > 0) {
      return base * recencyDiscount(s, nowMs);
    }
    return base;
  }
  const r = s.reinforcements as number;
  const d = s.decays as number;
  const n = r + d;
  const pHat = r / n;
  // Shrinkage: n/(n+3) pulls sparse evidence toward neutral (0.5)
  const raw = Math.max(PLAYBOOK_REWARD_MIN, Math.min(PLAYBOOK_REWARD_MAX, (2 * pHat - 1) * PLAYBOOK_REWARD_MAX * (n / (n + 3))));
  if (nowMs !== undefined && raw > 0) {
    return raw * recencyDiscount(s, nowMs);
  }
  return raw;
}

/**
 * The gentle positive reward for an INJECTABLE strategy that was applied to an
 * answer the EXTERNAL grounding gate verified as "grounded" — NOT the strategy's
 * own self-report. This is the implicit POSITIVE half of the reinforcement loop:
 * before it, reward only moved on a user CORRECTION (−1 decay) or an EXPLICIT
 * approval (+1), so a strategy that quietly worked every day still faded under
 * disuse-decay. Now a verified-grounded success nudges the applied strategy up.
 *
 * Deliberately SMALL (≪ the explicit ±1): an explicit correction outweighs ~10 of
 * these, so the bank reinforces what quietly works WITHOUT letting a stochastic
 * success drown out a real correction. No self-confirmation loop: a probation
 * strategy is never injected, so it is never "applied", so it never reaches here —
 * its graduation stays user-gated. Only a clean grounded success reinforces; an
 * ungrounded / misgrounded / refused outcome reinforces nothing (the weakness
 * ledger records those as the negative signal).
 */
export const IMPLICIT_SUCCESS_REINFORCE_DELTA = 0.1;

/**
 * The reward delta for an applied strategy given the ask's terminal outcome:
 * +IMPLICIT_SUCCESS_REINFORCE_DELTA on a CLEAN verified "grounded" success, else 0.
 *
 * `hasSourceCheckCaveat` gates against the GROUNDED≠TRUE-weak success the whole-
 * answer verdict can still label "grounded": an answer resting only on untrusted/
 * poisonable sources, or carrying a citation that resolves but doesn't support its
 * claim (ALCE precision), or an uncited groundable claim. Reinforcing a strategy on
 * one of those would let a misgrounding the probe MISSED corrupt the bank, so a
 * source-check caveat reinforces nothing — only a pristine grounded answer does.
 */
export function implicitSuccessReinforceDelta(
  outcome: string,
  opts?: { readonly hasSourceCheckCaveat?: boolean }
): number {
  if (outcome !== "grounded") return 0;
  if (opts?.hasSourceCheckCaveat === true) return 0;
  return IMPLICIT_SUCCESS_REINFORCE_DELTA;
}
