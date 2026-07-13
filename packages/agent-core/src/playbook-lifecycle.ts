import {
  clampReward,
  hasValidTally,
  PLAYBOOK_REWARD_MAX,
  PLAYBOOK_REWARD_MIN,
  recencyDiscount,
  type PlaybookStrategy
} from "./playbook-model.js";

/**
 * PEVI pessimism constant (arXiv:2012.15085, Jin/Yang/Wang): the Wilson lower
 * confidence bound is the pessimistic estimate used for ranking — a
 * high-but-uncertain point estimate can never outrank a proven one.
 * λ=1.96 matches the 95% Wilson interval already computed by wilsonInterval.
 */
export const PLAYBOOK_PEVI_LAMBDA = 1.96;

/**
 * Standard Wilson score interval — the Memp (arXiv 2508.06433) confidence
 * gate so lifecycle decisions require sufficient evidence, not a single event.
 * z=1.96 ≈ 95% confidence by default.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96
): { lower: number; upper: number } {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || !Number.isFinite(z) || total <= 0) {
    return { lower: 0, upper: 1 };
  }
  const pHat = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = (pHat + z2 / (2 * total)) / denom;
  const margin = (z / denom) * Math.sqrt(pHat * (1 - pHat) / total + z2 / (4 * total * total));
  return { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) };
}

/**
 * PEVI ranking utility (arXiv:2012.15085, Jin/Yang/Wang — pessimism under
 * uncertainty): ranks by the Wilson lower confidence bound (value − λ·uncertainty)
 * so a thin-but-perfect strategy (wide CI) can never outrank a proven one (tight CI).
 * This is a CALIBRATION re-map for RANKING ONLY — the avoidance gate
 * (isAvoidedStrategy / PLAYBOOK_AVOID_BELOW) stays on the existing point-estimate
 * signal (clampReward) so the LCB never changes WHICH strategies are avoided.
 *
 * For a valid tally (r, d): n = r + d; lower = wilsonInterval(r, n).lower;
 * raw = (2·lower − 1) · PLAYBOOK_REWARD_MAX, clamped to [MIN, MAX].
 * The D-UCB recency discount on the positive component (arXiv:0805.3415)
 * is preserved — composition is unchanged.
 * No-tally legacy branch and nowMs-undefined invariant are byte-identical to
 * effectiveStrategyReward.
 */
export function rankingUtility(s: PlaybookStrategy, nowMs?: number): number {
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
  const { lower } = wilsonInterval(r, n, PLAYBOOK_PEVI_LAMBDA);
  const raw = Math.max(PLAYBOOK_REWARD_MIN, Math.min(PLAYBOOK_REWARD_MAX, (2 * lower - 1) * PLAYBOOK_REWARD_MAX));
  if (nowMs !== undefined && raw > 0) {
    return raw * recencyDiscount(s, nowMs);
  }
  return raw;
}

/** Lifecycle action from Memp (arXiv 2508.06433): deprecate a confidently-bad entry, graduate a confidently-good probation entry, retain otherwise. */
export type StrategyLifecycleAction = "retain" | "deprecate" | "graduate";

export function planStrategyLifecycle(
  s: PlaybookStrategy,
  _opts?: Record<string, unknown>
): StrategyLifecycleAction {
  if (!hasValidTally(s)) {
    return "retain";
  }
  const r = s.reinforcements as number;
  const d = s.decays as number;
  const n = r + d;
  const { lower, upper } = wilsonInterval(r, n);
  if (upper < 0.4 && n >= 5) {
    return "deprecate";
  }
  if (s.probation === true && lower > 0.5 && n >= 3) {
    return "graduate";
  }
  return "retain";
}

/**
 * Learned avoidance: a strategy whose reward has sunk to or below this is
 * EXCLUDED from injection entirely (not merely deranked) — even in a small bank
 * where ranking would otherwise return everything. The soft, reversible
 * counterpart to the veto store: a strategy corrected this many times stops
 * being applied, but stays in the bank (visible, and an approval can lift it
 * back above the line).
 */
export const PLAYBOOK_AVOID_BELOW = -4;

/**
 * True when a strategy is avoided (never injected). Checks the legacy
 * reward floor OR a Memp-evidence-gated deprecation (arXiv 2508.06433)
 * so a confidently-bad entry is excluded even if its net reward hasn't
 * crossed the floor yet.
 */
export function isAvoidedStrategy(strategy: PlaybookStrategy): boolean {
  return clampReward(strategy.reward) <= PLAYBOOK_AVOID_BELOW || planStrategyLifecycle(strategy) === "deprecate";
}

/**
 * A strategy is injectable when it is neither avoided (reward floor / evidence
 * deprecation) nor on probation without sufficient good evidence to graduate.
 * Memp (arXiv 2508.06433): a probation entry whose lifecycle action is
 * "graduate" becomes injectable; one with insufficient evidence stays guarded.
 */
export function isInjectableStrategy(strategy: PlaybookStrategy): boolean {
  if (isAvoidedStrategy(strategy)) {
    return false;
  }
  if (strategy.probation !== true) {
    return true;
  }
  // Evidence-gated graduation: probation clears only when Memp says graduate
  return planStrategyLifecycle(strategy) === "graduate";
}

/**
 * SSGM temporal-decay governance (arXiv:2603.11768, Lam/Li/Zhang/Zhao 2026):
 * discard/withhold entries whose evidence has gone cold since last successful
 * reinforcement to mitigate temporal obsolescence and semantic drift.
 *
 * 120 days ≈ 4 D-UCB half-lives (arXiv:0805.3415): at that age the
 * recency discount has already shrunk the rank score to ~1/16 of its original,
 * but the RANK penalty applies only to the SCORE — on the small-bank
 * inject-all path the strategy is still INCLUDED in the eligible set and still
 * shapes the local model on ancient evidence. This gate is a DISTINCT second
 * stage (eligibility membership, not rank score) that removes cold-sparse
 * strategies from the injected set entirely, where D-UCB only discounts them.
 */
export const PLAYBOOK_STALE_AFTER_DAYS = 120;

/**
 * Returns true when a strategy's evidence is both OLD and SPARSE, meaning it
 * was reinforced once (or a few times) long ago and never since — the temporal
 * obsolescence case SSGM targets (arXiv:2603.11768).
 *
 * Fail-safe exemptions (all return false without throwing):
 * - nowMs absent → caller has no clock; can't measure age.
 * - No lastReinforcedAt → never-reinforced strategy is fresh/grounded, not
 *   cold; staleness applies only to evidence that WAS earned then went cold.
 * - Unparseable timestamp → ignore, don't throw.
 * - Age ≤ threshold → not cold yet.
 * - Deep tally (reinforcements + decays ≥ 3) → accumulated evidence, not sparse.
 *
 * Distinct from D-UCB recencyDiscount: recencyDiscount multiplies
 * the positive reward magnitude for RANKING — a stale strategy still ranks
 * (lower) and is still INJECTED on the inject-all path. isStaleStrategy is an
 * ELIGIBILITY filter: membership drop, not rank penalty; a different pipeline
 * stage with a different effect.
 *
 * Reversible: a new reinforcement updates lastReinforcedAt → instantly
 * injectable again (parity with avoidance / probation lifecycle).
 */
export function isStaleStrategy(strategy: PlaybookStrategy, nowMs?: number): boolean {
  if (nowMs === undefined) {
    return false;
  }
  if (strategy.lastReinforcedAt === undefined) {
    return false;
  }
  const anchorMs = Date.parse(strategy.lastReinforcedAt);
  if (isNaN(anchorMs)) {
    return false;
  }
  const ageDays = (nowMs - anchorMs) / 86_400_000;
  if (ageDays <= PLAYBOOK_STALE_AFTER_DAYS) {
    return false;
  }
  const tally = (strategy.reinforcements ?? 0) + (strategy.decays ?? 0);
  if (tally >= 3) {
    return false;
  }
  return true;
}

/**
 * Origins that an UNATTENDED process may never decay. A `manual` strategy is a
 * rule the user wrote themselves; a `grounded` one is evidence-backed. An offhand
 * correction in one session must not silently unlearn either — the user's own
 * written rule can only be changed by the user (`muse playbook reward/forget`).
 *
 * This became load-bearing the moment the decay gate was calibrated: while its
 * cosine floor sat above the reachable band the gate had NEVER fired, so nothing
 * could be unlearned at all; now that a correction genuinely reaches it, the
 * unattended path must be scoped to what Muse itself inferred.
 */
export const USER_AUTHORED_ORIGINS: readonly string[] = ["manual", "grounded"];

export function isUserAuthoredStrategy(entry: { readonly origin?: string }): boolean {
  return entry.origin !== undefined && USER_AUTHORED_ORIGINS.includes(entry.origin);
}
